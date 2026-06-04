from base64 import b64encode
from collections import defaultdict

from odoo import api, fields, models, _
from odoo.exceptions import UserError

from reportlab.graphics.barcode import createBarcodeDrawing
from reportlab.lib.units import mm


class SaleOrder(models.Model):
    _inherit = 'sale.order'


    trigas_driver_id = fields.Many2one(
        'x.choferes',
        string='Chofer',
        copy=False
    )

    has_trigas_cylinders = fields.Boolean(
        string='Tiene productos de cilindros',
        compute='_compute_has_trigas_cylinders',
        store=True
    )

    trigas_flow_state = fields.Selection([
        ('draft', 'Borrador'),
        ('generated', 'Conduces generados'),
        ('in_progress', 'En proceso'),
        ('done', 'Finalizado'),
    ], string='Estado flujo cilindros', default='draft', copy=False)

    trigas_conduce_count = fields.Integer(
        string='Cantidad de conduces',
        default=0,
        copy=False
    )

    trigas_flow_lot_ids = fields.Many2many(
        'stock.lot',
        'sale_order_trigas_lot_rel',
        'order_id',
        'lot_id',
        string='Seriales del flujo Trigas',
        copy=False,
        readonly=True
    )

    trigas_out_truck_location_id = fields.Many2one(
        'stock.location',
        string='Camión de ida',
        copy=False,
        readonly=True
    )

    trigas_customer_location_id = fields.Many2one(
        'stock.location',
        string='Ubicación cliente Trigas',
        related='partner_id.trigas_customer_location_id',
        readonly=True
    )

    trigas_customer_location_barcode = fields.Char(
        string='Barcode ubicación cliente',
        related='partner_id.trigas_customer_location_barcode',
        readonly=True
    )

    trigas_expected_return_date = fields.Datetime(
        string='Retorno esperado',
        copy=False
    )

    trigas_picking_1_id = fields.Many2one(
        'stock.picking',
        string='Conduce 1',
        copy=False
    )

    trigas_picking_2_id = fields.Many2one(
        'stock.picking',
        string='Conduce 2',
        copy=False
    )

    @api.depends('order_line.product_id', 'order_line.product_uom_qty')
    def _compute_has_trigas_cylinders(self):
        for order in self:
            cylinder_lines = order.order_line.filtered(
                lambda l: (
                    l.product_id
                    and l.product_id.product_tmpl_id.is_cylinder_conduce
                    and l.product_id.type == 'product'
                    and l.product_uom_qty > 0
                )
            )
            order.has_trigas_cylinders = bool(cylinder_lines)

    def _get_trigas_cylinder_lines(self):
        self.ensure_one()
        return self.order_line.filtered(
            lambda l: (
                l.product_id
                and l.product_id.product_tmpl_id.is_cylinder_conduce
                and l.product_id.type == 'product'
                and l.product_uom_qty > 0
            )
        )

    def _get_trigas_customer_location(self):
        self.ensure_one()

        partner = self.partner_id
        if not partner:
            raise UserError(_('La orden de venta no tiene cliente definido.'))

        if not partner.trigas_customer_location_id:
            partner._trigas_create_customer_location()

        if not partner.trigas_customer_location_id:
            raise UserError(_('No se pudo generar la ubicación Trigas del cliente.'))

        return partner.trigas_customer_location_id

    def _trigas_format_report_datetime(self, value):
        if not value:
            return ''
        return fields.Datetime.context_timestamp(self, value).strftime('%d/%m/%Y %I:%M %p')

    def _get_trigas_customer_location_barcode_png(self):
        self.ensure_one()

        barcode_value = self.trigas_customer_location_barcode
        if not barcode_value:
            return ''

        drawing = createBarcodeDrawing(
            'Code128',
            value=barcode_value,
            barHeight=18 * mm,
            humanReadable=True,
            width=110 * mm,
        )
        png_data = drawing.asString('png')
        return b64encode(png_data).decode()

    def _get_trigas_report_lines(self):
        self.ensure_one()

        lots_by_product = defaultdict(list)
        for lot in self.trigas_flow_lot_ids.sorted(lambda l: (l.product_id.id, l.name or '')):
            lots_by_product[lot.product_id.id].append(lot.name or '')

        lines = []
        for line in self._get_trigas_cylinder_lines():
            product_serials = lots_by_product.get(line.product_id.id, [])
            lines.append({
                'description': line.name or line.product_id.display_name,
                'pickup_date': self._trigas_format_report_datetime(self.date_order),
                'expected_return_date': self._trigas_format_report_datetime(self.trigas_expected_return_date),
                'qty_dispatched': line.product_uom_qty,
                'qty_returned': 0.0,
                'serial_numbers': ', '.join(product_serials),
            })

        return lines

    def action_confirm(self):
        res = super().action_confirm()

        for order in self:
            if order.has_trigas_cylinders:
                order._generate_trigas_conduces()

        return res

    def _generate_trigas_conduces(self):
        self.ensure_one()

        if any([
            self.trigas_picking_1_id,
            self.trigas_picking_2_id,
        ]):
            return

        cylinder_lines = self._get_trigas_cylinder_lines()
        if not cylinder_lines:
            return

        warehouse = self.warehouse_id
        if not warehouse:
            raise UserError(_('La orden de venta no tiene almacén definido.'))

        if not warehouse.lot_stock_id:
            raise UserError(_('El almacén no tiene ubicación de stock definida.'))

        pending_out_location, _pending_return_location = self._get_or_create_trigas_pending_locations(warehouse)
        customer_location = self._get_trigas_customer_location()
        stock_location = warehouse.lot_stock_id

        picking_type_1 = self.env.ref('trigas_4_conduces.picking_type_trigas_step_1', raise_if_not_found=False)
        picking_type_2 = self.env.ref('trigas_4_conduces.picking_type_trigas_step_2', raise_if_not_found=False)

        if not all([picking_type_1, picking_type_2]):
            raise UserError(_('No se encontraron los tipos de operación Trigas. Actualiza el módulo nuevamente.'))

        p1 = self._create_trigas_picking(
            name_suffix='Entrega a Camion',
            picking_type=picking_type_1,
            location_id=stock_location.id,
            location_dest_id=pending_out_location.id,
            sale_lines=cylinder_lines,
            step_code='1',
            auto_assign=True,
        )

        p2 = self._create_trigas_picking(
            name_suffix='Entrega a Cliente',
            picking_type=picking_type_2,
            location_id=pending_out_location.id,
            location_dest_id=customer_location.id,
            sale_lines=cylinder_lines,
            step_code='2',
            auto_assign=False,
        )

        self.write({
            'trigas_conduce_count': 2,
            'trigas_flow_state': 'generated',
            'trigas_picking_1_id': p1.id,
            'trigas_picking_2_id': p2.id,
        })

    def _get_or_create_trigas_pending_locations(self, warehouse):
        self.ensure_one()

        parent_location = warehouse.view_location_id
        if not parent_location:
            raise UserError(_('El almacén no tiene ubicación padre definida.'))

        location_model = self.env['stock.location']

        pending_out = location_model.search([
            ('usage', '=', 'internal'),
            ('name', '=', 'PENDIENTE_IDA'),
            ('location_id', '=', parent_location.id),
        ], limit=1)

        if not pending_out:
            pending_out = location_model.create({
                'name': 'PENDIENTE_IDA',
                'usage': 'internal',
                'location_id': parent_location.id,
            })

        pending_return = location_model.search([
            ('usage', '=', 'internal'),
            ('name', '=', 'PENDIENTE_REGRESO'),
            ('location_id', '=', parent_location.id),
        ], limit=1)

        if not pending_return:
            pending_return = location_model.create({
                'name': 'PENDIENTE_REGRESO',
                'usage': 'internal',
                'location_id': parent_location.id,
            })

        return pending_out, pending_return

    def _create_trigas_picking(self, name_suffix, picking_type, location_id, location_dest_id, sale_lines, step_code, auto_assign=False):
        self.ensure_one()

        picking_vals = {
            'partner_id': self.partner_id.id,
            'origin': f'{self.name} - {name_suffix}',
            'picking_type_id': picking_type.id,
            'location_id': location_id,
            'location_dest_id': location_dest_id,
            'move_type': 'direct',
            'note': f'Flujo Trigas paso {step_code} generado desde {self.name}',
            'is_trigas_conduce': True,
            'trigas_step': step_code,
            'sale_order_id': self.id,
        }
        picking = self.env['stock.picking'].create(picking_vals)

        created_moves = self.env['stock.move']

        for line in sale_lines:
            move = self.env['stock.move'].create({
                'name': line.name or line.product_id.display_name,
                'product_id': line.product_id.id,
                'product_uom_qty': line.product_uom_qty,
                'product_uom': line.product_uom.id,
                'picking_id': picking.id,
                'location_id': location_id,
                'location_dest_id': location_dest_id,
                'sale_line_id': line.id,
                'origin': self.name,
                'partner_id': self.partner_id.id,
            })
            created_moves |= move

        picking.action_confirm()

        if step_code == '1':
            picking.move_ids_without_package._do_unreserve()

            picking.move_line_ids.filtered(
                lambda ml: not ml.qty_done and not ml.lot_id
            ).unlink()

            for move in created_moves:
                qty = int(move.product_uom_qty or 0)
                if qty <= 0:
                    continue

                for _i in range(qty):
                    self.env['stock.move.line'].create({
                        'move_id': move.id,
                        'picking_id': picking.id,
                        'product_id': move.product_id.id,
                        'product_uom_id': move.product_uom.id,
                        'qty_done': 0.0,
                        'location_id': move.location_id.id,
                        'location_dest_id': move.location_dest_id.id,
                    })

        if auto_assign:
            picking.action_assign()

        return picking

    def _after_validate_trigas_step_1(self, picking):
        self.ensure_one()

        lots = picking.move_line_ids.filtered(
            lambda ml: ml.lot_id and ml.qty_done > 0
        ).mapped('lot_id')
        if not lots:
            raise UserError(_('El Conduce 1 debe tener seriales con cantidad realizada para guardar el flujo.'))

        truck = picking.trigas_truck_location_id
        if not truck:
            raise UserError(_('Debes indicar el camión de ida en el Conduce 1.'))

        customer_location = self._get_trigas_customer_location()

        self.write({
            'trigas_flow_lot_ids': [(6, 0, lots.ids)],
            'trigas_out_truck_location_id': truck.id,
            'trigas_flow_state': 'in_progress',
        })

        self._update_picking_source_location(self.trigas_picking_2_id, truck)
        self._update_picking_destination_location(self.trigas_picking_2_id, customer_location)
        self._load_flow_lots_into_picking(self.trigas_picking_2_id, lots)

        if self.trigas_picking_2_id and self.trigas_picking_2_id.state not in ('done', 'cancel'):
            self.trigas_picking_2_id.action_assign()

    def _update_picking_source_location(self, picking, new_source_location):
        self.ensure_one()

        if not picking or not new_source_location:
            return

        picking.location_id = new_source_location.id

        for move in picking.move_ids_without_package:
            move.location_id = new_source_location.id

        for move_line in picking.move_line_ids:
            move_line.location_id = new_source_location.id

    def _update_picking_destination_location(self, picking, new_destination_location):
        self.ensure_one()

        if not picking or not new_destination_location:
            return

        picking.location_dest_id = new_destination_location.id

        for move in picking.move_ids_without_package:
            move.location_dest_id = new_destination_location.id

        for move_line in picking.move_line_ids:
            move_line.location_dest_id = new_destination_location.id

    def _load_flow_lots_into_picking(self, picking, lots):
        self.ensure_one()

        if not picking:
            return

        lots_by_product = defaultdict(list)
        for lot in lots:
            lots_by_product[lot.product_id.id].append(lot)

        existing_lines = picking.move_line_ids.filtered(lambda ml: ml.qty_done == 0)
        if existing_lines:
            existing_lines.unlink()

        for move in picking.move_ids_without_package:
            product_lots = lots_by_product.get(move.product_id.id, [])
            move.product_uom_qty = len(product_lots)

            for lot in product_lots:
                self.env['stock.move.line'].create({
                    'move_id': move.id,
                    'picking_id': picking.id,
                    'product_id': move.product_id.id,
                    'product_uom_id': move.product_uom.id,
                    'qty_done': 0.0,
                    'lot_id': lot.id,
                    'location_id': move.location_id.id,
                    'location_dest_id': move.location_dest_id.id,
                })
