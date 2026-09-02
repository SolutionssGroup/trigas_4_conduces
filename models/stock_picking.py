from odoo import api, fields, models, _
from odoo.exceptions import UserError


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    def name_get(self):
        result = []
        for picking in self:
            name = picking.name or ''
            if picking.is_trigas_conduce and picking.sale_order_id:
                name = '%s - Orden: %s' % (name, picking.sale_order_id.name)
            result.append((picking.id, name))
        return result


    is_trigas_conduce = fields.Boolean(
        string='Es conduce Trigas',
        default=False,
        copy=False
    )

    trigas_step = fields.Selection([
        ('1', 'Conduce 1'),
        ('2', 'Conduce 2'),
        ('3', 'Conduce Recogida'),
    ], string='Paso flujo Trigas', copy=False)

    sale_order_id = fields.Many2one(
        'sale.order',
        string='Orden de venta',
        copy=False
    )

    trigas_driver_id = fields.Many2one(
        'x.choferes',
        string='Chofer',
        related='sale_order_id.trigas_driver_id',
        readonly=True,
        store=True
    )

    trigas_truck_location_id = fields.Many2one(
        'stock.location',
        string='Ubicación camión',
        domain="[('usage', '=', 'internal')]",
        copy=False
    )

    trigas_customer_location_id = fields.Many2one(
        'stock.location',
        string='Ubicación cliente',
        related='sale_order_id.trigas_customer_location_id',
        readonly=True
    )

    trigas_native_source_location_id = fields.Many2one(
        'stock.location',
        string='Ubicación origen nativa',
        domain="[('usage', '=', 'internal')]",
        copy=False
    )

    trigas_native_destination_location_scanned = fields.Boolean(
        string='Ubicación destino nativa escaneada',
        copy=False
    )

    trigas_customer_location_scanned = fields.Boolean(
        string='Ubicación cliente escaneada',
        default=False,
        copy=False
    )

    trigas_delivery_signature = fields.Binary(
        string='Firma de entrega',
        attachment=True,
        copy=False
    )

    trigas_delivery_signed_by = fields.Char(
        string='Firmado por',
        copy=False
    )

    trigas_delivery_signed_on = fields.Datetime(
        string='Fecha de firma',
        copy=False
    )

    trigas_delivery_signature_filename = fields.Char(
        string='Nombre archivo firma',
        copy=False
    )

    trigas_signature_record_id = fields.Many2one(
        'trigas.delivery.signature.record',
        string='Registro de firma',
        copy=False,
        readonly=True
    )

    trigas_delivery_signature_status = fields.Selection([
        ('pending', 'Pendiente'),
        ('signed', 'Firmado'),
    ], string='Estado de firma', compute='_compute_trigas_delivery_signature_status', store=True)

    @api.depends('trigas_delivery_signature')
    def _compute_trigas_delivery_signature_status(self):
        for picking in self:
            picking.trigas_delivery_signature_status = 'signed' if picking.trigas_delivery_signature else 'pending'

    def _trigas_create_or_update_signature_record(self):
        self.ensure_one()

        if not self.is_trigas_conduce or self.trigas_step not in ('2', '3'):
            return False

        if not self.trigas_delivery_signature:
            return False

        signature_record = self.trigas_signature_record_id
        vals = {
            'picking_id': self.id,
            'signed_by': self.trigas_delivery_signed_by or '',
            'signed_on': self.trigas_delivery_signed_on or fields.Datetime.now(),
            'signature_image': self.trigas_delivery_signature,
            'signature_filename': self.trigas_delivery_signature_filename,
            'state': 'signed',
        }

        if signature_record:
            signature_record.write(vals)
        else:
            signature_record = self.env['trigas.delivery.signature.record'].create(vals)
            self.trigas_signature_record_id = signature_record.id

        return signature_record

    def action_open_trigas_signature_record(self):
        self.ensure_one()

        if not self.trigas_signature_record_id:
            raise UserError(_('Este conduce todavía no tiene un registro histórico de firma.'))

        return {
            'type': 'ir.actions.act_window',
            'name': _('Registro de firma'),
            'res_model': 'trigas.delivery.signature.record',
            'res_id': self.trigas_signature_record_id.id,
            'view_mode': 'form',
            'target': 'current',
        }

    def _trigas_is_step_3_or_tri3_picking(self):
        self.ensure_one()

        name = (self.name or '').upper()
        origin = (self.origin or '').upper()
        note = (self.note or '').upper()

        return bool(
            self.trigas_step == '3'
            or '/TRI3/' in name
            or 'TRI3' in name
            or 'RECOGIDA' in origin
            or 'RECOGIDA' in note
        )

    def action_open_trigas_signature_wizard(self):
        self.ensure_one()

        if not self.is_trigas_conduce or self.trigas_step not in ('2', '3'):
            raise UserError(_('La firma solo aplica al Conduce 2 y a la Recogida de Cilindros.'))

        if self.trigas_step == '2':
            signature_info = self.trigas_barcode_get_signature_info()

            if not signature_info.get('customer_location_ready'):
                raise UserError(_('Debes escanear la ubicación del cliente antes de firmar.'))

            if not signature_info.get('has_done_cylinders'):
                raise UserError(_('Debes escanear los seriales antes de firmar.'))

        if self.trigas_step == '3':
            signature_info = self.trigas_barcode_get_signature_info()

            if not signature_info.get('has_done_cylinders'):
                raise UserError(_('Debes escanear al menos un cilindro antes de firmar.'))

            if not signature_info.get('truck_location_ready'):
                raise UserError(_('Debes escanear la ubicación del camión antes de firmar.'))

        view = self.env.ref(
            'trigas_4_conduces.view_trigas_delivery_signature_wizard_form',
            raise_if_not_found=False
        )

        if not view:
            raise UserError(_('No se encontró la vista del wizard de firma.'))

        return {
            'type': 'ir.actions.act_window',
            'name': _('Firmar recogida') if self.trigas_step == '3' else _('Firmar conduce'),
            'res_model': 'trigas.delivery.signature.wizard',
            'view_mode': 'form',
            'views': [(view.id, 'form')],
            'view_id': view.id,
            'target': 'new',
            'context': {
                'default_picking_id': self.id,
                'default_signed_by': self.partner_id.name or '',
            },
        }
    def trigas_barcode_get_signature_info(self):
        self.ensure_one()

        if not self.is_trigas_conduce or self.trigas_step not in ('2', '3'):
            return {
                'is_step_2': False,
                'is_step_3': False,
                'can_sign': False,
                'signed': False,
                'message': '',
                'customer_location_ready': False,
                'truck_location_ready': False,
                'has_done_cylinders': False,
            }

        done_serial_lines = self.move_line_ids.filtered(
            lambda ml: ml.lot_id and ml.qty_done > 0 and ml.product_id.product_tmpl_id.is_cylinder_conduce
        )
        done_cylinder_moves = self.move_ids_without_package.filtered(
            lambda m: m.product_id.product_tmpl_id.is_cylinder_conduce and m.quantity_done > 0
        )

        has_done_cylinders = bool(done_serial_lines or done_cylinder_moves)
        signed = bool(self.trigas_delivery_signature)

        customer_location_ready = False
        truck_location_ready = False

        if self.trigas_step == '2':
            expected_customer_location = self._trigas_get_expected_customer_location()
            customer_location_ready = bool(
                expected_customer_location
                and self.location_dest_id
                and self.location_dest_id.id == expected_customer_location.id
                and self.trigas_customer_location_scanned
            )
            can_sign = bool(has_done_cylinders and customer_location_ready and not signed)

            if signed:
                message = _('Firma registrada')
            elif not has_done_cylinders:
                message = _('Escanea los seriales antes de firmar.')
            elif not customer_location_ready:
                message = _('Escanea la ubicación del cliente antes de firmar.')
            else:
                message = _('Listo para firmar.')

        else:
            truck_location_ready = bool(
                self.trigas_truck_location_id
                and self.location_dest_id
                and self.location_dest_id.id == self.trigas_truck_location_id.id
            )
            can_sign = bool(has_done_cylinders and truck_location_ready and not signed)

            if signed:
                message = _('Firma registrada')
            elif not has_done_cylinders:
                message = _('Escanea los seriales antes de firmar.')
            elif not truck_location_ready:
                message = _('Escanea la ubicación del camión antes de firmar.')
            else:
                message = _('Listo para firmar.')

        return {
            'is_step_2': self.trigas_step == '2',
            'is_step_3': self.trigas_step == '3',
            'can_sign': can_sign,
            'signed': signed,
            'message': message,
            'customer_location_ready': customer_location_ready,
            'truck_location_ready': truck_location_ready,
            'has_done_cylinders': has_done_cylinders,
        }
    def trigas_barcode_save_delivery_signature(self, signed_by, signature_base64):
        self.ensure_one()

        is_step_2 = bool(self.is_trigas_conduce and self.trigas_step == '2')
        is_step_3 = bool(
            (self.is_trigas_conduce and self.trigas_step == '3')
            or self._trigas_is_step_3_or_tri3_picking()
        )

        if not is_step_2 and not is_step_3:
            raise UserError(_('La firma solo puede registrarse en el Conduce 2 o en la Recogida de Cilindros.'))

        if not signed_by or not signed_by.strip():
            raise UserError(_('Debes indicar el nombre de quien recibe.'))

        if not signature_base64:
            raise UserError(_('Debes capturar la firma antes de guardar.'))

        if self.trigas_step == '2':
            if not self.trigas_customer_location_scanned:
                raise UserError(_('Debes escanear la ubicación del cliente antes de firmar.'))

        if is_step_3:
            if not self.trigas_truck_location_id:
                raise UserError(_('Debes escanear la ubicación del camión antes de firmar.'))

            has_done_cylinders = bool(self.move_line_ids.filtered(
                lambda ml: ml.lot_id and ml.qty_done > 0 and ml.product_id.product_tmpl_id.is_cylinder_conduce
            ))
            if not has_done_cylinders:
                raise UserError(_('Debes escanear al menos un cilindro antes de firmar.'))

        if isinstance(signature_base64, str) and 'base64,' in signature_base64:
            signature_base64 = signature_base64.split('base64,', 1)[1]

        self.write({
            'trigas_delivery_signature': signature_base64,
            'trigas_delivery_signed_by': signed_by.strip(),
            'trigas_delivery_signed_on': fields.Datetime.now(),
            'trigas_delivery_signature_filename': 'firma_conduce_%s.png' % (self.name or self.id),
        })

        self._trigas_create_or_update_signature_record()

        if self.trigas_step == '2':
            self._trigas_sync_qty_delivered_to_sale_order()

        return True

    def _trigas_sync_qty_delivered_to_sale_order(self):
        """Refleja en la orden de venta lo realmente entregado por camion.

        El movimiento estandar de Odoo (WH/OUT) para los productos cilindro
        se cancela al confirmar la orden (ver
        SaleOrder._trigas_cancel_standard_delivery_pickings), porque esa
        entrega la controla este flujo de conduce por camion en su lugar.
        Como ese movimiento nunca llega a estado 'done', Odoo nunca calcula
        una qty_delivered para esas lineas por si solo. Por eso, al firmar
        el Conduce 2 (Camion -> Cliente), se recalcula aqui la cantidad
        entregada de cada producto cilindro a partir de lo realmente
        escaneado en los conduces firmados de esta orden, y se escribe
        directo en la linea de venta (requiere qty_delivered_method
        'manual' para estos productos, ver SaleOrderLine mas abajo).
        """
        self.ensure_one()

        sale_order = self.sale_order_id
        if not sale_order:
            return

        cylinder_lines = sale_order._get_trigas_cylinder_lines()
        if not cylinder_lines:
            return

        # sale_order.picking_ids es el campo estandar de Odoo (entregas WH/OUT
        # ligadas por grupo de aprovisionamiento); los conduces de este modulo
        # se enlazan a la orden solo por el campo custom sale_order_id de
        # stock.picking, asi que hay que buscarlos aparte.
        signed_step_2_pickings = self.env['stock.picking'].search([
            ('sale_order_id', '=', sale_order.id),
            ('is_trigas_conduce', '=', True),
            ('trigas_step', '=', '2'),
            ('trigas_delivery_signature', '!=', False),
        ])

        for line in cylinder_lines:
            product = line.product_id
            delivered_qty = sum(
                signed_step_2_pickings.mapped('move_line_ids').filtered(
                    lambda ml: ml.product_id == product and ml.lot_id
                ).mapped('qty_done')
            )
            if delivered_qty and delivered_qty != line.qty_delivered:
                line.write({'qty_delivered': delivered_qty})

    def action_send_trigas_delivery_email(self):
        self.ensure_one()

        if not self.is_trigas_conduce or self.trigas_step not in ('2', '3'):
            raise UserError(_('El envío de firma por correo solo aplica al Conduce 2 y a la Recogida de Cilindros.'))

        if not self.partner_id.email:
            raise UserError(_('El cliente no tiene un correo electrónico definido.'))

        if not self.trigas_delivery_signature:
            raise UserError(_('Debes registrar una firma antes de enviarla por correo.'))

        template = self.env.ref('trigas_4_conduces.mail_template_trigas_delivery_signature', raise_if_not_found=False)
        if not template:
            raise UserError(_('No se encontró la plantilla de correo de firma de entrega.'))

        template.send_mail(self.id, force_send=True)

        if self.trigas_signature_record_id:
            self.trigas_signature_record_id.state = 'emailed'

        return True

    def button_validate(self):
        for picking in self:
            if picking.is_trigas_conduce:
                if picking.trigas_step == '1':
                    picking._trigas_prepare_step_1_before_validate()
                elif picking.trigas_step == '2':
                    picking._trigas_prepare_step_2_before_validate()
                elif picking.trigas_step == '3':
                    picking._trigas_prepare_step_3_before_validate()
            elif picking._trigas_barcode_is_pickup_step():
                # TRI3 nativo: puede no tener is_trigas_conduce/trigas_step,
                # pero debe validarse como recogida, no como transferencia interna normal.
                picking._trigas_prepare_step_3_before_validate()
            elif picking._trigas_is_native_internal_transfer():
                picking._trigas_prepare_native_internal_transfer_before_validate()

        res = super().button_validate()

        for picking in self:
            if not picking.is_trigas_conduce or not picking.sale_order_id:
                continue

            if picking.trigas_step == '1':
                picking.sale_order_id._after_validate_trigas_step_1(picking)
            elif picking.trigas_step == '2':
                # Categoria A (ver casos S08650, S08673, S08685, S08691, S08692,
                # S08693, S08696, S08698, S08699, S08703, S08684, S08705):
                # _trigas_sync_qty_delivered_to_sale_order() ya existia, pero
                # solo se disparaba al guardar la firma
                # (trigas_barcode_save_delivery_signature), no al validar. La
                # firma se guarda unos segundos ANTES de que el conduce quede
                # en 'done' (confirmado contra datos reales de produccion), asi
                # que cualquier cilindro escaneado entre la firma y el click en
                # "Validar" nunca se contaba -> qty_delivered se quedaba en 0 o
                # parcial y el pedido no se podia facturar aunque el cliente ya
                # tuviera el cilindro. Al llamarlo tambien aqui, despues de
                # super().button_validate(), se recalcula con el estado final
                # y completo del conduce (metodo idempotente, es seguro
                # llamarlo dos veces).
                picking._trigas_sync_qty_delivered_to_sale_order()

        return res

    def action_assign(self):
        """Comprobar Disponibilidad.

        Para los conduces Trigas paso 2 (Camión -> Cliente), NUNCA se debe dejar
        que la reserva nativa de Odoo elija seriales libres de la ubicación del
        camión: esa ubicación es un fondo compartido por muchas órdenes cargadas
        en paralelo, y la reserva nativa no distingue a cuál orden pertenece cada
        serial (bug confirmado en los casos S08381 y S08432).

        En su lugar, se reutiliza `_load_flow_lots_into_picking`, que ya sabe
        reservar únicamente los seriales que el propio TRI1 de esa misma orden
        cargó (`trigas_flow_lot_ids`). Esto cubre tanto el click manual en
        "Comprobar Disponibilidad" como cualquier llamada interna a
        `action_assign()` sobre un picking TRI2 (incluyendo la regeneración de
        TRI2 al reconfirmar una orden cancelada, que también pasa por aquí).
        """
        trigas_step_2 = self.filtered(
            lambda p: p.is_trigas_conduce and p.trigas_step == '2' and p.sale_order_id
        )
        others = self - trigas_step_2

        res = True
        if others:
            res = super(StockPicking, others).action_assign()

        for picking in trigas_step_2:
            lots = picking._trigas_get_allowed_lot_ids_for_step_2()
            if lots:
                picking.sale_order_id._load_flow_lots_into_picking(picking, lots)
            else:
                super(StockPicking, picking).action_assign()

        return res

    def _check_warn_sms(self):
        result = super()._check_warn_sms()
        return result.filtered(lambda p: not p._trigas_barcode_is_customer_step())

    def _trigas_get_pending_locations(self):
        self.ensure_one()

        pending_locations = self.env['stock.location']
        if not self.sale_order_id or not self.sale_order_id.warehouse_id:
            return pending_locations

        warehouse = self.sale_order_id.warehouse_id
        pending_out, pending_return = self.sale_order_id._get_or_create_trigas_pending_locations(warehouse)
        pending_locations |= pending_out
        pending_locations |= pending_return
        return pending_locations

    def _trigas_get_expected_customer_location(self):
        self.ensure_one()

        if not self.sale_order_id:
            return self.env['stock.location']

        customer_location = self.sale_order_id._get_trigas_customer_location()
        return customer_location.exists()

    def _trigas_get_allowed_lot_ids_for_step_2(self):
        self.ensure_one()

        if not self.sale_order_id:
            return self.env['stock.lot']

        allowed_lots = self.sale_order_id.trigas_flow_lot_ids.exists()
        if allowed_lots:
            return allowed_lots

        fallback_lots = self.move_line_ids.mapped('lot_id').exists()
        return fallback_lots

    def _trigas_detect_scanned_truck_location(self):
        self.ensure_one()

        candidate_locations = self.env['stock.location']
        pending_locations = self._trigas_get_pending_locations()

        serial_done_lines = self.move_line_ids.filtered(
            lambda ml: (
                ml.lot_id
                and ml.qty_done > 0
                and ml.location_dest_id
                and ml.location_dest_id.usage == 'internal'
                and ml.location_dest_id.id not in pending_locations.ids
            )
        )
        candidate_locations |= serial_done_lines.mapped('location_dest_id')

        done_lines = self.move_line_ids.filtered(
            lambda ml: (
                ml.qty_done > 0
                and ml.location_dest_id
                and ml.location_dest_id.usage == 'internal'
                and ml.location_dest_id.id not in pending_locations.ids
            )
        )
        candidate_locations |= done_lines.mapped('location_dest_id')

        if (
            self.location_dest_id
            and self.location_dest_id.usage == 'internal'
            and self.location_dest_id.id not in pending_locations.ids
        ):
            candidate_locations |= self.location_dest_id

        candidate_locations = candidate_locations.exists()

        if not candidate_locations and self.trigas_truck_location_id:
            return self.trigas_truck_location_id

        if not candidate_locations:
            return self.env['stock.location']

        if len(candidate_locations) > 1:
            raise UserError(_(
                'Se detectaron varias ubicaciones internas como posible camión. '
                'Asegúrate de escanear solo una ubicación de camión antes de validar.'
            ))

        return candidate_locations

    def _trigas_detect_scanned_customer_location(self):
        self.ensure_one()

        candidate_locations = self.env['stock.location']
        pending_locations = self._trigas_get_pending_locations()

        done_lines = self.move_line_ids.filtered(
            lambda ml: (
                ml.qty_done > 0
                and ml.location_dest_id
                and ml.location_dest_id.usage == 'customer'
                and ml.location_dest_id.id not in pending_locations.ids
                and ml.location_dest_id.id != self.location_id.id
            )
        )
        candidate_locations |= done_lines.mapped('location_dest_id')

        if (
            self.location_dest_id
            and self.location_dest_id.usage == 'customer'
            and self.location_dest_id.id not in pending_locations.ids
            and self.location_dest_id.id != self.location_id.id
        ):
            candidate_locations |= self.location_dest_id

        candidate_locations = candidate_locations.exists()

        if not candidate_locations:
            return self._trigas_get_expected_customer_location()

        if len(candidate_locations) > 1:
            raise UserError(_(
                'Se detectaron varias ubicaciones internas como posible ubicación del cliente. '
                'Asegúrate de escanear solo la ubicación correcta del cliente antes de validar.'
            ))

        return candidate_locations

    def _trigas_resolve_truck_location(self, step_label):
        self.ensure_one()

        truck_location = self.trigas_truck_location_id or self._trigas_detect_scanned_truck_location()

        if not truck_location:
            raise UserError(_(
                'Debes seleccionar o escanear la ubicación del camión antes de validar el %s.'
            ) % step_label)

        if truck_location.usage != 'internal':
            raise UserError(_(
                'La ubicación escaneada para el camión debe ser de tipo interna.'
            ))

        self.trigas_truck_location_id = truck_location.id
        return truck_location

    def _trigas_resolve_customer_location(self):
        self.ensure_one()

        expected_customer_location = self._trigas_get_expected_customer_location()
        scanned_customer_location = self._trigas_detect_scanned_customer_location()

        if not expected_customer_location:
            raise UserError(_('La orden no tiene una ubicación Trigas de cliente definida.'))

        if not scanned_customer_location:
            raise UserError(_('Debes seleccionar o escanear la ubicación del cliente antes de validar el Conduce 2.'))

        if scanned_customer_location.id != expected_customer_location.id:
            raise UserError(_(
                'La ubicación escaneada no corresponde al cliente de esta orden. '
                'Ubicación esperada: %s'
            ) % expected_customer_location.display_name)

        return expected_customer_location

    def _trigas_barcode_is_truck_step(self):
        self.ensure_one()
        return bool(self.is_trigas_conduce and self.trigas_step == '1')

    def _trigas_barcode_is_customer_step(self):
        self.ensure_one()
        return bool(self.is_trigas_conduce and self.trigas_step == '2')

    def trigas_barcode_register_truck_location(self, location_id):
        self.ensure_one()

        if not self._trigas_barcode_is_truck_step():
            return False

        location = self.env['stock.location'].browse(location_id).exists()
        if not location:
            return False

        if location.usage != 'internal':
            raise UserError(_('La ubicación escaneada para el camión debe ser de tipo interna.'))

        pending_locations = self._trigas_get_pending_locations()
        if location.id in pending_locations.ids:
            raise UserError(_('La ubicación escaneada corresponde a una ubicación pendiente, no a un camión.'))

        self.write({
            'trigas_truck_location_id': location.id,
            'location_dest_id': location.id,
        })

        self.move_ids_without_package.write({
            'location_dest_id': location.id,
        })

        self.move_line_ids.write({
            'location_dest_id': location.id,
        })

        return True

    def trigas_barcode_register_customer_location(self, location_id):
        self.ensure_one()

        if not self._trigas_barcode_is_customer_step():
            return False

        location = self.env['stock.location'].browse(location_id).exists()
        if not location:
            return False

        if location.usage != 'customer':
            raise UserError(_('La ubicación escaneada del cliente debe ser de tipo cliente.'))

        expected_location = self._trigas_get_expected_customer_location()
        if not expected_location:
            raise UserError(_('La orden no tiene ubicación Trigas de cliente definida.'))

        if location.id != expected_location.id:
            raise UserError(_(
                'La ubicación escaneada no corresponde al cliente de esta orden. '
                'Ubicación esperada: %s'
            ) % expected_location.display_name)

        self.write({
            'location_dest_id': location.id,
            'trigas_customer_location_scanned': True,
        })

        self.move_ids_without_package.write({
            'location_dest_id': location.id,
        })

        self.move_line_ids.write({
            'location_dest_id': location.id,
        })

        return True

    def trigas_barcode_confirm_expected_customer_location_for_pda(self):
        self.ensure_one()

        if not (self.is_trigas_conduce and self.trigas_step == '2'):
            return {
                'ok': False,
                'message': _('Este método solo aplica al Conduce 2.'),
            }

        expected_location = self._trigas_get_expected_customer_location()

        if not expected_location:
            return {
                'ok': False,
                'message': _('La orden no tiene una ubicación Trigas de cliente definida.'),
            }

        if expected_location.usage != 'customer':
            return {
                'ok': False,
                'message': _('La ubicación esperada del cliente no es de tipo cliente: %s') % expected_location.display_name,
            }

        self.write({
            'location_dest_id': expected_location.id,
            'trigas_customer_location_scanned': True,
        })

        self.move_ids_without_package.write({
            'location_dest_id': expected_location.id,
        })

        self.move_line_ids.write({
            'location_dest_id': expected_location.id,
        })

        return {
            'ok': True,
            'location_id': expected_location.id,
            'location_name': expected_location.display_name,
            'message': _('Ubicación cliente confirmada: %s') % expected_location.display_name,
        }

    def trigas_barcode_validate_step_1_capacity(self):
        self.ensure_one()

        if not (self.is_trigas_conduce and self.trigas_step == '1'):
            return True

        allowed_moves = self.move_ids_without_package.filtered(
            lambda m: m.product_id.product_tmpl_id.is_cylinder_conduce
        )

        if not allowed_moves:
            raise UserError(_('No existen productos configurados para este conduce.'))

        expected_qty = sum(allowed_moves.mapped('product_uom_qty'))

        scanned_qty = len(
            self.move_line_ids.filtered(
                lambda ml: ml.qty_done > 0 and ml.lot_id
            )
        ) + 1

        if scanned_qty > expected_qty:
            raise UserError(_(
                'Ya se alcanzó la cantidad máxima permitida para esta orden. '
                'Cantidad esperada: %s. Cantidad escaneada: %s.'
            ) % (expected_qty, scanned_qty))

        return True

    def _trigas_validate_step_1_serial_physical_availability(self, lot):
        self.ensure_one()

        if not self._trigas_barcode_is_truck_step():
            return True

        positive_quants = self.env['stock.quant'].search([
            ('lot_id', '=', lot.id),
            ('product_id', '=', lot.product_id.id),
            ('quantity', '>', 0),
        ])
        positive_locations = positive_quants.mapped('location_id')

        if not positive_locations:
            raise UserError(_('Este serial no tiene existencia disponible en almacén.'))

        if len(positive_locations) > 1:
            if not self.location_id:
                raise UserError(_('Este picking no tiene ubicación de origen definida.'))

            self.env['stock.quant']._trigas_force_correct_serial_location(
                lot.product_id, lot, self.location_id
            )

            positive_quants = self.env['stock.quant'].search([
                ('lot_id', '=', lot.id),
                ('product_id', '=', lot.product_id.id),
                ('quantity', '>', 0),
            ])
            positive_locations = positive_quants.mapped('location_id')

        current_location = positive_locations[0]

        # Ademas de duplicados POSITIVOS (ya cubiertos arriba), buscar
        # cualquier resto con cantidad distinta de cero en OTRA ubicacion
        # (ej. restos negativos huerfanos), que nunca se detectan solo
        # buscando quantity > 0, y forzar la correccion tambien en ese caso.
        # Excluimos ubicaciones virtuales (ej. ajustes de inventario): son
        # contrapartidas contables normales y forzar su correccion duplicaria
        # la cantidad real del serial en su ubicacion correcta.
        all_nonzero_quants = self.env['stock.quant'].sudo().search([
            ('lot_id', '=', lot.id),
            ('product_id', '=', lot.product_id.id),
            ('quantity', '!=', 0),
            ('location_id.usage', 'in', ['internal', 'customer', 'transit']),
        ])
        stray_elsewhere = all_nonzero_quants.filtered(
            lambda q: q.location_id.id != current_location.id
        )
        if stray_elsewhere:
            self.env['stock.quant']._trigas_force_correct_serial_location(
                lot.product_id, lot, current_location
            )

        # REGLA TRIGAS: el escaneo físico siempre gana sobre el dato del
        # sistema. Si el serial figura en una ubicación distinta a la
        # esperada por este picking (incluyendo ubicaciones de cliente),
        # no se bloquea: se fuerza la corrección hacia self.location_id y
        # se continúa.
        if not self.location_id:
            raise UserError(_('Este picking no tiene ubicación de origen definida.'))

        if current_location.id != self.location_id.id:
            self.env['stock.quant']._trigas_force_correct_serial_location(
                lot.product_id, lot, self.location_id
            )

        return True

    def trigas_barcode_validate_serial_step_1(self, lot_id, client_lot_ids=None):
        self.ensure_one()

        if not (self.is_trigas_conduce and self.trigas_step == '1'):
            return True

        lot = self.env['stock.lot'].browse(lot_id).exists()
        if not lot:
            raise UserError(_('Serial no encontrado.'))

        allowed_moves = self.move_ids_without_package.filtered(
            lambda m: m.product_id.product_tmpl_id.is_cylinder_conduce
        )
        if not allowed_moves:
            raise UserError(_('No existen productos configurados para este conduce.'))

        if lot.product_id.id not in allowed_moves.mapped('product_id').ids:
            raise UserError(_('El serial %s no pertenece a los productos definidos en esta orden.') % lot.name)

        self._trigas_validate_step_1_serial_physical_availability(lot)

        duplicate_line = self.move_line_ids.filtered(
            lambda ml: ml.lot_id.id == lot.id and ml.qty_done > 0
        )
        if duplicate_line:
            raise UserError(_('El serial %s ya fue escaneado en este conduce.') % lot.name)

        expected_qty = sum(allowed_moves.mapped('product_uom_qty'))

        # El tope SIEMPRE se calcula contra lo que ya existe realmente en la
        # base de datos (move_line_ids con qty_done > 0), nunca contra
        # client_lot_ids que envía el navegador. client_lot_ids vive en el
        # estado del componente Barcode en memoria/sessionStorage y puede
        # llegar vacío o incompleto si la sesión de PDA se reinicia tras una
        # desconexión — eso permitía volver a escanear un lote completo de
        # seriales sin que el tope lo bloqueara (causa raíz confirmada de la
        # sobre-validación 8->16 vista en los casos S08370/S08422). El
        # parámetro client_lot_ids se sigue aceptando por compatibilidad con
        # las llamadas existentes del JS, pero ya no se usa para este cálculo.
        scanned_qty = len(
            self.move_line_ids.filtered(
                lambda ml: ml.qty_done > 0 and ml.lot_id
            )
        ) + 1

        if scanned_qty > expected_qty:
            raise UserError(_(
                'Ya se alcanzó la cantidad máxima permitida para esta orden. '
                'Cantidad esperada: %s. Cantidad escaneada: %s.'
            ) % (expected_qty, scanned_qty))

        return True

    def trigas_barcode_validate_serial_step_2(self, lot_id):
        self.ensure_one()

        if not (self.is_trigas_conduce and self.trigas_step == '2'):
            return True

        lot = self.env['stock.lot'].browse(lot_id).exists()
        if not lot:
            raise UserError(_('Serial no encontrado.'))

        duplicate_line = self.move_line_ids.filtered(
            lambda ml: ml.lot_id.id == lot.id and ml.qty_done > 0
        )
        if duplicate_line:
            raise UserError(_('El serial %s ya fue escaneado en este conduce.') % lot.name)

        allowed_lots = self._trigas_get_allowed_lot_ids_for_step_2()
        if not allowed_lots or lot.id not in allowed_lots.ids:
            raise UserError(_('El serial %s no pertenece a esta orden para entrega al cliente.') % lot.name)

        return True

    def _trigas_is_native_internal_transfer(self):
        self.ensure_one()
        return bool(
            not self.is_trigas_conduce
            and self.picking_type_id
            and self.picking_type_id.code == 'internal'
        )

    def _trigas_get_unique_internal_location_for_lot(self, lot):
        self.ensure_one()

        if not lot:
            raise UserError(_('Serial no encontrado.'))

        quant_model = self.env['stock.quant'].sudo()
        quants = quant_model.search([
            ('lot_id', '=', lot.id),
            ('quantity', '>', 0),
            ('location_id.usage', 'in', ['internal', 'customer']),
        ])

        locations = quants.mapped('location_id').exists()

        if not locations:
            raise UserError(_(
                'El serial %s no tiene existencia disponible en una ubicación interna o de cliente.'
            ) % lot.name)

        if len(locations) > 1:
            raise UserError(_(
                'El serial %s existe en múltiples ubicaciones internas o de cliente. '
                'Debes definir la ubicación origen manualmente.'
            ) % lot.name)

        return locations[0]

    def _trigas_get_native_source_location_reference(self):
        self.ensure_one()
        return self.trigas_native_source_location_id.exists()

    def trigas_barcode_validate_native_serial_scan(self, lot_id):
        self.ensure_one()

        if not self._trigas_is_native_internal_transfer():
            return False

        lot = self.env['stock.lot'].browse(lot_id).exists()
        if not lot:
            raise UserError(_('Serial no encontrado.'))

        duplicate_line = self.move_line_ids.filtered(
            lambda ml: ml.lot_id.id == lot.id and ml.qty_done > 0
        )
        if duplicate_line:
            raise UserError(_(
                'El serial %s ya fue escaneado en esta transferencia.'
            ) % lot.name)

        source_location = self._trigas_get_unique_internal_location_for_lot(lot)
        reference_location = self._trigas_get_native_source_location_reference()

        if reference_location and reference_location.id != source_location.id:
            raise UserError(_(
                'El serial %s no pertenece a la ubicación origen de esta transferencia. '
                'Ubicación esperada: %s. Ubicación encontrada: %s.'
            ) % (
                lot.name,
                reference_location.display_name,
                source_location.display_name,
            ))

        if not lot.product_id.product_tmpl_id.is_cylinder_conduce:
            return False

        source_was_detected = False

        if not reference_location:
            source_was_detected = True

            self.write({
                'trigas_native_source_location_id': source_location.id,
                'location_id': source_location.id,
            })

            self.move_ids_without_package.write({
                'location_id': source_location.id,
            })

            self.move_line_ids.write({
                'location_id': source_location.id,
            })

        return {
            'location_id': source_location.id,
            'location_name': source_location.display_name,
            'source_was_detected': source_was_detected,
        }






    def trigas_barcode_get_pda_expected_qty(self):
        self.ensure_one()

        expected_qty = sum(self.move_ids_without_package.mapped('product_uom_qty'))

        return {
            'expected_qty': expected_qty,
            'destination_name': self.location_dest_id.display_name if self.location_dest_id else '',
            'destination_barcode': self.location_dest_id.barcode if self.location_dest_id and self.location_dest_id.barcode else '',
            'state': self.state,
        }

    def trigas_barcode_validate_destination_location_for_pda(self, scanned_value):
        self.ensure_one()

        scanned_value = (scanned_value or '').strip()

        if not scanned_value:
            return {
                'ok': False,
                'is_location': False,
                'message': _('No se recibió ninguna ubicación.'),
            }

        destination = self.location_dest_id

        if not destination:
            return {
                'ok': False,
                'is_location': False,
                'message': _('Este conduce no tiene ubicación destino definida.'),
            }

        # En Conduce 1 puede existir un destino temporal como WH/PENDIENTE_IDA.
        # Por eso NO validamos primero self.location_dest_id.
        # Validamos la ubicación realmente escaneada y, si es camión, la registramos como destino.

        Location = self.env['stock.location']

        # Buscar primero por barcode exacto. Esto evita que Odoo devuelva
        # una ubicación equivocada por búsquedas amplias en display_name.
        scanned_location = Location.search([
            ('barcode', '=', scanned_value),
        ], limit=1)

        if not scanned_location:
            scanned_location = Location.search([
                ('name', '=', scanned_value),
            ], limit=1)

        if not scanned_location:
            scanned_location = Location.search([
                ('complete_name', '=', scanned_value),
            ], limit=1)

        if not scanned_location:
            scanned_location = Location.search([
                ('display_name', '=', scanned_value),
            ], limit=1)

        if not scanned_location:
            return {
                'ok': False,
                'is_location': False,
                'message': _('No es una ubicación de camión: %s') % scanned_value,
            }

        if self.trigas_step == '1':
            if scanned_location.usage != 'internal':
                return {
                    'ok': False,
                    'is_location': True,
                    'message': _('No es una ubicación de camión: %s') % scanned_value,
                    'location_id': scanned_location.id,
                    'location_name': scanned_location.display_name,
                }

            if not scanned_location.is_trigas_truck_location:
                return {
                    'ok': False,
                    'is_location': True,
                    'message': _('No es una ubicación de camión: %s') % scanned_value,
                    'location_id': scanned_location.id,
                    'location_name': scanned_location.display_name,
                }

            self.trigas_barcode_register_truck_location(scanned_location.id)

            return {
                'ok': True,
                'is_location': True,
                'message': _('Ubicación camión confirmada: %s') % scanned_location.display_name,
                'location_id': scanned_location.id,
                'location_name': scanned_location.display_name,
                'expected_location_id': scanned_location.id,
                'expected_location_name': scanned_location.display_name,
            }

        # La ubicación leída debe ser exactamente la ubicación destino del picking.
        if scanned_location.id != destination.id:
            return {
                'ok': False,
                'is_location': True,
                'message': _('Ubicación incorrecta. Leída: %(read)s. Esperada: %(expected)s') % {
                    'read': scanned_location.display_name,
                    'expected': destination.display_name,
                },
                'location_id': scanned_location.id,
                'location_name': scanned_location.display_name,
                'expected_location_id': destination.id,
                'expected_location_name': destination.display_name,
            }

        return {
            'ok': True,
            'is_location': True,
            'message': _('Ubicación destino confirmada: %s') % destination.display_name,
            'location_id': destination.id,
            'location_name': destination.display_name,
            'location_barcode': destination.barcode or '',
        }


    def trigas_barcode_validate_temp_serial_for_pda(self, serial_name, existing_serials=None):
        self.ensure_one()

        serial_name = (serial_name or '').strip()
        existing_serials = existing_serials or []

        # TRI3 / Recogida de Cilindros es un conduce abierto.
        # Durante el escaneo NO debe crear stock.move ni stock.move.line.
        # Solo validamos que el serial exista, sea cilindro y esté disponible.
        tri3_open_pickup = self._trigas_barcode_is_pickup_step()

        if self.state in ('done', 'cancel'):
            return {
                'ok': False,
                'message': _('Este conduce ya está realizado o cancelado.'),
            }

        if not serial_name:
            return {
                'ok': False,
                'message': _('No se recibió ningún serial.'),
            }

        allowed_moves = self.move_ids_without_package.filtered(
            lambda m: m.product_id.product_tmpl_id.is_cylinder_conduce
        )

        # TRIGAS FIX CONDUCE 1: el duplicado y el tope máximo de seriales
        # SIEMPRE se validan contra lo que ya está realmente guardado en la
        # base de datos (move_line_ids), nunca contra existing_serials que
        # manda el navegador. existing_serials vive en sessionStorage (por
        # pestaña) y se puede perder o resetear si la pestaña se recarga o
        # el dispositivo la descarta por memoria, lo que permitía que el
        # conteo real en Odoo quedara corto sin que el operador se diera
        # cuenta hasta validar el Conduce 1 (caso confirmado: 12 esperados /
        # 11 escaneados en Cibao).
        if not tri3_open_pickup:
            already_done_lines = self.move_line_ids.filtered(
                lambda ml: ml.lot_id and ml.qty_done > 0 and ml.product_id.product_tmpl_id.is_cylinder_conduce
            )

            if serial_name in already_done_lines.mapped('lot_id.name'):
                return {
                    'ok': False,
                    'message': _('El serial %s ya fue leído.') % serial_name,
                }

            expected_qty = sum(allowed_moves.mapped('product_uom_qty'))
            if expected_qty and len(already_done_lines) >= expected_qty:
                return {
                    'ok': False,
                    'message': _('Ya se leyó la cantidad completa esperada.'),
                }

        lot = self.env['stock.lot'].search([
            ('name', '=', serial_name),
        ], limit=1)

        if not lot:
            return {
                'ok': False,
                'message': _('El serial %s no existe en Odoo.') % serial_name,
            }

        if tri3_open_pickup:
            if not lot.product_id or not lot.product_id.product_tmpl_id.is_cylinder_conduce:
                return {
                    'ok': False,
                    'message': _('El serial %s no pertenece a un producto marcado como cilindro Trigas.') % serial_name,
                }

            duplicate_line = self.move_line_ids.filtered(
                lambda ml: ml.lot_id.id == lot.id and ml.qty_done > 0
            )
            if duplicate_line:
                return {
                    'ok': False,
                    'message': _('El serial %s ya fue guardado en este conduce.') % serial_name,
                }

            try:
                source_location = self._trigas_get_current_location_for_lot_step_3(lot)
            except UserError as e:
                return {
                    'ok': False,
                    'message': str(e),
                }

            return {
                'ok': True,
                'tri3_open_pickup': True,
                'serial': serial_name,
                'product': lot.product_id.display_name if lot.product_id else '',
                'source_location_id': source_location.id,
                'source_location_name': source_location.display_name,
                'message': _('Serial leído: %s | Origen: %s') % (
                    serial_name,
                    source_location.display_name,
                ),
            }

        allowed_products = allowed_moves.mapped('product_id') or self.move_ids_without_package.mapped('product_id')

        if lot.product_id and lot.product_id not in allowed_products:
            expected_products = ', '.join(allowed_products.mapped('display_name'))
            return {
                'ok': False,
                'message': _('El serial %(serial)s pertenece al producto "%(serial_product)s", pero este conduce espera "%(expected_product)s".') % {
                    'serial': serial_name,
                    'serial_product': lot.product_id.display_name,
                    'expected_product': expected_products,
                },
            }

        if self._trigas_barcode_is_truck_step():
            try:
                self._trigas_validate_step_1_serial_physical_availability(lot)
            except UserError as e:
                return {
                    'ok': False,
                    'message': str(e),
                }

        # TRIGAS FIX CONDUCE 1: guardar el serial en la base de datos en el
        # mismo momento del escaneo, no esperar a que el navegador mande la
        # lista completa más adelante. Así el conteo real en Odoo nunca
        # depende de que la pestaña/sesión del navegador sobreviva hasta el
        # final del Conduce 1.
        move = False
        for candidate_move in allowed_moves:
            if candidate_move.product_id.id == lot.product_id.id:
                move = candidate_move
                break
        if not move:
            move = (allowed_moves or self.move_ids_without_package)[:1]

        if move:
            self.env['stock.move.line'].create({
                'picking_id': self.id,
                'move_id': move.id,
                'product_id': move.product_id.id,
                'product_uom_id': move.product_uom.id,
                'location_id': move.location_id.id,
                'location_dest_id': move.location_dest_id.id,
                'lot_id': lot.id,
                'qty_done': 1.0,
            })

        return {
            'ok': True,
            'serial': serial_name,
            'product': lot.product_id.display_name if lot.product_id else '',
        }

    def trigas_barcode_save_temp_serials_for_pda(self, serial_names):
        self.ensure_one()

        if self.state in ('done', 'cancel'):
            raise UserError(_('No puedes modificar seriales de un conduce realizado o cancelado.'))

        serial_names = serial_names or []
        serial_names = [s for s in serial_names if s]

        # Evitar duplicados manteniendo el orden leído en la PDA.
        clean_serials = []
        for serial in serial_names:
            if serial not in clean_serials:
                clean_serials.append(serial)

        serial_names = clean_serials

        allowed_moves = self.move_ids_without_package.filtered(
            lambda m: m.product_id.product_tmpl_id.is_cylinder_conduce
        )
        allowed_product_ids = allowed_moves.mapped('product_id').ids
        expected_qty = int(sum(allowed_moves.mapped('product_uom_qty')))

        # TRIGAS FIX CONDUCE 1: este método ya NO borra los seriales que
        # estén guardados en Odoo con qty_done > 0 (escaneos ya confirmados,
        # guardados uno por uno al momento de escanear por
        # trigas_barcode_validate_temp_serial_for_pda). Antes se borraba
        # TODO lo que hubiera y se recreaba solo con lo que mandara el
        # navegador en serial_names; si esa lista llegaba incompleta (por
        # ejemplo por un reinicio de la pestaña/sessionStorage), este
        # método terminaba BORRANDO escaneos reales ya guardados. Ahora
        # solo se limpian líneas viejas sin escaneo real (lot_id con
        # qty_done <= 0, restos de reservas) y se completan los seriales de
        # serial_names que todavía no estén guardados, sin tocar los que ya
        # están.
        stale_serial_lines = self.move_line_ids.filtered(
            lambda ml: (
                ml.lot_id
                and (not allowed_product_ids or ml.product_id.id in allowed_product_ids)
                and ml.qty_done <= 0
            )
        )
        stale_serial_lines.unlink()

        already_done_lines = self.move_line_ids.filtered(
            lambda ml: ml.lot_id and ml.qty_done > 0 and (
                not allowed_product_ids or ml.product_id.id in allowed_product_ids
            )
        )
        already_done_names = set(already_done_lines.mapped('lot_id.name'))

        missing_serials = [s for s in serial_names if s not in already_done_names]

        total_after = len(already_done_lines) + len(missing_serials)
        if expected_qty and total_after > expected_qty:
            raise UserError(_(
                'No puedes guardar más seriales que la cantidad esperada. '
                'Cantidad esperada: %s. Cantidad recibida: %s.'
            ) % (expected_qty, total_after))

        if self._trigas_barcode_is_truck_step():
            for serial_name in missing_serials:
                lot = self.env['stock.lot'].search([('name', '=', serial_name)], limit=1)
                if not lot:
                    raise UserError(_('No se encontró el serial %s.') % serial_name)
                self._trigas_validate_step_1_serial_physical_availability(lot)

        if not missing_serials:
            if self.state not in ('done', 'cancel'):
                self.action_confirm()
                self.action_assign()

            return {
                'serials': self.trigas_barcode_get_scanned_serials_for_pda(),
                'state': self.state,
            }

        moves_by_product = {}
        for move in self.move_ids_without_package:
            moves_by_product.setdefault(move.product_id.id, move)

        for serial_name in missing_serials:
            lot = self.env['stock.lot'].search([('name', '=', serial_name)], limit=1)

            if not lot:
                raise UserError(_('No se encontró el serial %s.') % serial_name)

            product = lot.product_id
            move = moves_by_product.get(product.id)

            if not move:
                # Si por alguna razón el lote no tiene product_id o no coincide,
                # usamos la primera línea del picking como respaldo.
                move = self.move_ids_without_package[:1]

            if not move:
                raise UserError(_('No existe una línea de movimiento para guardar el serial %s.') % serial_name)

            self.env['stock.move.line'].create({
                'picking_id': self.id,
                'move_id': move.id,
                'product_id': move.product_id.id,
                'product_uom_id': move.product_uom.id,
                'location_id': move.location_id.id,
                'location_dest_id': move.location_dest_id.id,
                'lot_id': lot.id,
                'qty_done': 1.0,
            })

        if self.state not in ('done', 'cancel'):
            self.action_confirm()
            self.action_assign()

        return {
            'serials': self.trigas_barcode_get_scanned_serials_for_pda(),
            'state': self.state,
        }

    def trigas_barcode_get_scanned_serials_for_pda(self):
        self.ensure_one()

        serial_lines = self.move_line_ids.filtered(
            lambda ml: ml.lot_id and ml.qty_done > 0
        ).sorted(lambda ml: ml.id)

        result = []
        for line in serial_lines:
            result.append({
                'serial': line.lot_id.name,
                'product': line.product_id.display_name,
                'qty_done': line.qty_done,
            })

        return result


    def trigas_barcode_remove_scanned_serial_for_pda(self, serial_name):
        self.ensure_one()

        if self.state in ('done', 'cancel'):
            raise UserError(_('No puedes borrar seriales de un conduce realizado o cancelado.'))

        if not serial_name:
            return {
                'serials': self.trigas_barcode_get_scanned_serials_for_pda(),
                'state': self.state,
            }

        serial_lines = self.move_line_ids.filtered(
            lambda ml:
                ml.lot_id
                and ml.lot_id.name == serial_name
                and ml.qty_done > 0
        )

        if serial_lines:
            serial_lines.unlink()

        # Volvemos a poner el picking en listo si hay disponibilidad.
        if self.state not in ('done', 'cancel'):
            self.action_confirm()
            self.action_assign()

        return {
            'serials': self.trigas_barcode_get_scanned_serials_for_pda(),
            'state': self.state,
        }


    def trigas_barcode_get_native_serial_source_location(self, lot_id):
        self.ensure_one()

        if not self._trigas_is_native_internal_transfer():
            return False

        return self.trigas_barcode_validate_native_serial_scan(lot_id)

    def trigas_barcode_register_native_destination_location(self, location_id):
        self.ensure_one()

        if not self._trigas_is_native_internal_transfer():
            return False

        location = self.env['stock.location'].browse(location_id).exists()
        if not location:
            return False

        if location.usage != 'internal':
            raise UserError(_('La ubicación destino escaneada debe ser de tipo interna.'))

        source_location = self._trigas_get_native_source_location_reference()
        if not source_location:
            raise UserError(_('Primero debes escanear un serial para que el sistema determine la ubicación origen.'))

        if source_location.id == location.id:
            raise UserError(_('La ubicación destino no puede ser igual a la ubicación origen.'))

        self.write({
            'location_dest_id': location.id,
            'trigas_native_destination_location_scanned': True,
        })

        self.move_ids_without_package.write({
            'location_dest_id': location.id,
        })

        self.move_line_ids.write({
            'location_dest_id': location.id,
        })

        return {
            'location_id': location.id,
            'location_name': location.display_name,
        }

    def _trigas_prepare_native_internal_transfer_before_validate(self):
        self.ensure_one()

        lines_needing_serial = self.move_line_ids.filtered(
            lambda ml: ml.product_id.tracking == 'serial'
        )
        if lines_needing_serial:
            done_serial_lines = lines_needing_serial.filtered(
                lambda ml: ml.lot_id and ml.qty_done > 0
            )
            if not done_serial_lines:
                raise UserError(_('Debes escanear uno o más seriales antes de validar la transferencia.'))

        source_location = self._trigas_get_native_source_location_reference()
        if not source_location:
            raise UserError(_('No se ha definido la ubicación origen de la transferencia.'))

        destination_location = self.location_dest_id.exists()
        if not destination_location:
            raise UserError(_('Debes escanear la ubicación destino antes de validar la transferencia.'))

        if not self.trigas_native_destination_location_scanned:
            raise UserError(_('Debes escanear la ubicación destino antes de validar la transferencia.'))

        if destination_location.usage != 'internal':
            raise UserError(_('La ubicación destino de la transferencia debe ser de tipo interna.'))

        if source_location.id == destination_location.id:
            raise UserError(_('La ubicación destino no puede ser igual a la ubicación origen.'))

        for move_line in done_serial_lines:
            real_source_location = self._trigas_get_unique_internal_location_for_lot(move_line.lot_id)

            if real_source_location.id != source_location.id:
                raise UserError(_(
                    'El serial %s ya no se encuentra en la ubicación origen esperada. '
                    'Ubicación esperada: %s. Ubicación actual: %s.'
                ) % (
                    move_line.lot_id.name,
                    source_location.display_name,
                    real_source_location.display_name,
                ))

            move_line.write({
                'location_id': source_location.id,
                'location_dest_id': destination_location.id,
            })

        related_moves = done_serial_lines.mapped('move_id')
        if related_moves:
            related_moves.write({
                'location_id': source_location.id,
                'location_dest_id': destination_location.id,
            })

        self.write({
            'location_id': source_location.id,
            'location_dest_id': destination_location.id,
        })

    def _trigas_barcode_is_pickup_step(self):
        self.ensure_one()
        return bool(
            (self.is_trigas_conduce and self.trigas_step == '3')
            or (self.picking_type_id and self.picking_type_id.sequence_code == 'TRI3')
        )

    def _trigas_get_current_location_for_lot_step_3(self, lot):
        self.ensure_one()

        Quant = self.env['stock.quant']

        quants = Quant.search([
            ('lot_id', '=', lot.id),
            ('quantity', '>', 0),
            ('location_id.usage', 'in', ['customer', 'internal']),
        ])

        valid_quants = quants.filtered(
            lambda q: q.location_id
            and q.location_id.usage in ('customer', 'internal')
            and q.quantity > 0
        )

        locations = valid_quants.mapped('location_id').exists()

        if not locations:
            raise UserError(_(
                'El serial %s no tiene existencia disponible en una ubicación válida.'
            ) % lot.name)

        if len(locations) > 1:
            raise UserError(_(
                'El serial %s aparece con existencia en varias ubicaciones: %s. '
                'Debes depurar el serial antes de recogerlo.'
            ) % (
                lot.name,
                ', '.join(locations.mapped('display_name'))
            ))

        return locations[0]

    def _trigas_get_step_3_pickup_groups(self):
        self.ensure_one()

        groups = {}

        lines = self.move_line_ids.filtered(
            lambda ml: ml.lot_id and ml.qty_done > 0
        ).sorted(lambda ml: (
            ml.location_id.display_name or '',
            ml.product_id.display_name or '',
            ml.lot_id.name or '',
        ))

        for line in lines:
            location = line.location_id
            key = location.id

            if key not in groups:
                groups[key] = {
                    'location_id': location.id,
                    'location_name': location.display_name,
                    'serials': [],
                }

            groups[key]['serials'].append({
                'serial': line.lot_id.name,
                'product': line.product_id.display_name,
            })

        return list(groups.values())

    def trigas_barcode_validate_serial_step_3(self, lot_id):
        self.ensure_one()

        if not self._trigas_barcode_is_pickup_step():
            return {
                'ok': False,
                'message': _('Este método solo aplica al Conduce de Recogida.'),
            }

        lot = self.env['stock.lot'].browse(lot_id).exists()

        if not lot:
            raise UserError(_('Serial no encontrado.'))

        if not lot.product_id or not lot.product_id.product_tmpl_id.is_cylinder_conduce:
            raise UserError(_('El serial %s no pertenece a un producto marcado como cilindro Trigas.') % lot.name)

        duplicate_line = self.move_line_ids.filtered(
            lambda ml: ml.lot_id.id == lot.id and ml.qty_done > 0
        )

        if duplicate_line:
            raise UserError(_('El serial %s ya fue escaneado en este conduce de recogida.') % lot.name)

        source_location = self._trigas_get_current_location_for_lot_step_3(lot)

        destination_location = self.trigas_truck_location_id or self.location_dest_id or source_location

        # TRI3 es recogida abierta. Al primer serial, el picking debe tomar
        # como origen la ubicación real del serial para que Barcode renderice líneas.
        if not self.move_line_ids:
            self.write({
                'location_id': source_location.id,
                'location_dest_id': destination_location.id,
            })

        move = self.move_ids_without_package.filtered(
            lambda m: m.product_id.id == lot.product_id.id and m.location_id.id == source_location.id
        )[:1]

        if not move:
            move = self.env['stock.move'].create({
                'name': lot.product_id.display_name,
                'product_id': lot.product_id.id,
                'product_uom_qty': 0.0,
                'product_uom': lot.product_id.uom_id.id,
                'picking_id': self.id,
                'location_id': source_location.id,
                'location_dest_id': destination_location.id,
                'origin': self.origin or self.name,
                'partner_id': self.partner_id.id if self.partner_id else False,
            })

        move.product_uom_qty = move.product_uom_qty + 1

        self.env['stock.move.line'].create({
            'move_id': move.id,
            'picking_id': self.id,
            'product_id': lot.product_id.id,
            'product_uom_id': lot.product_id.uom_id.id,
            'qty_done': 1.0,
            'lot_id': lot.id,
            'location_id': source_location.id,
            'location_dest_id': destination_location.id,
        })

        # TRI3 es una recogida abierta. Al crear líneas desde PDA,
        # debemos sacar el picking de borrador para que Barcode renderice líneas reales.
        if self.state == 'draft':
            self.action_confirm()

        if self.state in ('confirmed', 'waiting', 'assigned'):
            self.action_assign()

        return {
            'ok': True,
            'tri3_open_pickup': True,
            'serial': lot.name,
            'product': lot.product_id.display_name,
            'source_location_id': source_location.id,
            'source_location_name': source_location.display_name,
            'groups': self._trigas_get_step_3_pickup_groups(),
            'message': _('Serial recogido: %s | Origen: %s') % (
                lot.name,
                source_location.display_name,
            ),
        }

    def trigas_barcode_register_pickup_truck_location(self, location_id):
        self.ensure_one()

        if not self._trigas_barcode_is_pickup_step():
            return {
                'ok': False,
                'message': _('Este método solo aplica al Conduce de Recogida.'),
            }

        truck_location = self.env['stock.location'].browse(location_id).exists()

        if not truck_location:
            raise UserError(_('No se encontró la ubicación del camión.'))

        if truck_location.usage != 'internal' or not truck_location.is_trigas_truck_location:
            raise UserError(_('No es una ubicación de camión: %s') % truck_location.display_name)

        # Guardar destino principal del picking.
        vals = {
            'location_dest_id': truck_location.id,
        }

        if 'trigas_truck_location_id' in self._fields:
            vals['trigas_truck_location_id'] = truck_location.id

        self.write(vals)

        # Cambiar destino de todos los movimientos y líneas ya leídas.
        # El origen de cada serial se mantiene como su ubicación real.
        self.move_ids.write({
            'location_dest_id': truck_location.id,
        })

        self.move_line_ids.write({
            'location_dest_id': truck_location.id,
        })

        groups = self._trigas_get_step_3_pickup_groups()

        return {
            'ok': True,
            'is_location': True,
            'location_id': truck_location.id,
            'location_name': truck_location.display_name,
            'truck_location_id': truck_location.id,
            'truck_location_name': truck_location.display_name,
            'groups': groups,
            'has_serials': bool(groups),
            'has_truck': True,
            'can_validate': bool(groups),
            'message': _('Ubicación destino camión leída: %s') % truck_location.display_name,
        }
    def _trigas_prepare_step_3_before_validate(self):
        self.ensure_one()

        if not self._trigas_barcode_is_pickup_step():
            return True

        if not self.trigas_delivery_signature:
            raise UserError(_('Debes registrar la firma antes de validar la recogida.'))

        destination = self.location_dest_id

        if not destination:
            raise UserError(_('Debes seleccionar la ubicación destino del camión antes de validar la recogida.'))

        if destination.usage != 'internal' or not destination.is_trigas_truck_location:
            raise UserError(_('La ubicación destino debe ser una ubicación camión Trigas. Ubicación actual: %s') % destination.display_name)

        if 'trigas_truck_location_id' in self._fields and not self.trigas_truck_location_id:
            self.trigas_truck_location_id = destination.id

        return True


    def trigas_barcode_process_raw_scan_step_3(self, scanned_value):
        self.ensure_one()

        if not self._trigas_barcode_is_pickup_step():
            return {
                'ok': False,
                'message': _('Este método solo aplica al Conduce de Recogida.'),
            }

        scanned_value = (scanned_value or '').strip()

        if not scanned_value:
            raise UserError(_('Lectura vacía.'))

        # En recogida abierta, lo primero que se lee normalmente son seriales.
        # Por eso primero buscamos si la lectura corresponde a un lote/serial.
        Lot = self.env['stock.lot']
        lot = Lot.search([
            ('name', '=', scanned_value),
        ], limit=1)

        if lot:
            return self.trigas_barcode_validate_serial_step_3(lot.id)

        # Si no es serial, entonces intentamos tratar la lectura como ubicación camión.
        # No buscamos por display_name porque display_name no es un campo almacenado.
        Location = self.env['stock.location']

        location = Location.search([
            ('barcode', '=', scanned_value),
        ], limit=1)

        if not location:
            location = Location.search([
                ('name', '=', scanned_value),
            ], limit=1)

        if not location:
            location = Location.search([
                ('complete_name', '=', scanned_value),
            ], limit=1)

        if not location:
            raise UserError(_('No se encontró serial ni ubicación camión con la lectura: %s') % scanned_value)

        if location.usage != 'internal' or not location.is_trigas_truck_location:
            raise UserError(_('No es una ubicación de camión: %s') % scanned_value)

        return self.trigas_barcode_register_pickup_truck_location(location.id)


    @api.model
    def trigas_pickup_validate_frontend_scan(self, scanned_value):
        scanned_value = (scanned_value or '').strip()

        if not scanned_value:
            return {
                'ok': False,
                'message': _('Lectura vacía.'),
            }

        lot = self.env['stock.lot'].search([
            ('name', '=', scanned_value),
        ], limit=1)

        if lot:
            if not lot.product_id or not lot.product_id.product_tmpl_id.is_cylinder_conduce:
                return {
                    'ok': False,
                    'message': _('El serial %s no pertenece a un producto marcado como cilindro Trigas.') % scanned_value,
                }

            quants = self.env['stock.quant'].search([
                ('lot_id', '=', lot.id),
                ('quantity', '>', 0),
            ])

            quants = quants.filtered(lambda q: q.location_id and q.location_id.usage in ('internal', 'customer'))

            if not quants:
                return {
                    'ok': False,
                    'message': _('El serial %s no tiene existencia disponible.') % scanned_value,
                }

            quant = quants.sorted(lambda q: q.in_date or q.create_date, reverse=True)[:1]
            source_location = quant.location_id

            return {
                'ok': True,
                'scan_type': 'serial',
                'serial': lot.name,
                'lot_id': lot.id,
                'product_id': lot.product_id.id,
                'product': lot.product_id.display_name,
                'source_location_id': source_location.id,
                'source_location_name': source_location.display_name,
                'message': _('Serial leído: %s | Origen: %s') % (
                    lot.name,
                    source_location.display_name,
                ),
            }

        location = self.env['stock.location'].search([
            ('barcode', '=', scanned_value),
        ], limit=1)

        if not location:
            location = self.env['stock.location'].search([
                ('name', '=', scanned_value),
            ], limit=1)

        if not location:
            location = self.env['stock.location'].search([
                ('complete_name', '=', scanned_value),
            ], limit=1)

        if location:
            if location.usage != 'internal' or not location.is_trigas_truck_location:
                return {
                    'ok': False,
                    'scan_type': 'location',
                    'message': _('No es una ubicación de camión: %s') % location.display_name,
                }

            return {
                'ok': True,
                'scan_type': 'truck_location',
                'location_id': location.id,
                'location_name': location.display_name,
                'message': _('Ubicación camión leída: %s') % location.display_name,
            }

        return {
            'ok': False,
            'message': _('No se encontró serial ni ubicación camión con la lectura: %s') % scanned_value,
        }

    @api.model
    def trigas_pickup_create_and_validate_from_frontend(self, serial_names, truck_location_id):
        serial_names = [s.strip() for s in (serial_names or []) if s and s.strip()]
        serial_names = list(dict.fromkeys(serial_names))

        if not serial_names:
            return {
                'ok': False,
                'message': _('Debes leer al menos un serial.'),
            }

        truck_location = self.env['stock.location'].browse(truck_location_id).exists()

        if not truck_location:
            return {
                'ok': False,
                'message': _('No se encontró la ubicación camión.'),
            }

        if truck_location.usage != 'internal' or not truck_location.is_trigas_truck_location:
            return {
                'ok': False,
                'message': _('La ubicación destino no es una ubicación camión válida.'),
            }

        picking_type = self.env.ref('trigas_4_conduces.picking_type_trigas_step_3', raise_if_not_found=False)

        if not picking_type:
            picking_type = self.env['stock.picking.type'].search([
                ('sequence_code', '=', 'TRI3'),
            ], limit=1)

        if not picking_type:
            return {
                'ok': False,
                'message': _('No se encontró el tipo de operación TRI3.'),
            }

        first_source = False
        prepared = []

        for serial_name in serial_names:
            lot = self.env['stock.lot'].search([
                ('name', '=', serial_name),
            ], limit=1)

            if not lot:
                return {
                    'ok': False,
                    'message': _('El serial %s no existe en Odoo.') % serial_name,
                }

            if not lot.product_id or not lot.product_id.product_tmpl_id.is_cylinder_conduce:
                return {
                    'ok': False,
                    'message': _('El serial %s no pertenece a un producto marcado como cilindro Trigas.') % serial_name,
                }

            quants = self.env['stock.quant'].search([
                ('lot_id', '=', lot.id),
                ('quantity', '>', 0),
            ])
            quants = quants.filtered(lambda q: q.location_id and q.location_id.usage in ('internal', 'customer'))

            if not quants:
                return {
                    'ok': False,
                    'message': _('El serial %s no tiene existencia disponible.') % serial_name,
                }

            quant = quants.sorted(lambda q: q.in_date or q.create_date, reverse=True)[:1]
            source_location = quant.location_id

            if not first_source:
                first_source = source_location

            prepared.append((lot, source_location))

        picking = self.env['stock.picking'].create({
            'picking_type_id': picking_type.id,
            'location_id': first_source.id,
            'location_dest_id': truck_location.id,
            'is_trigas_conduce': True,
            'trigas_step': '3',
            'trigas_truck_location_id': truck_location.id if 'trigas_truck_location_id' in self._fields else False,
            'origin': _('Recogida PDA'),
        })

        moves_by_key = {}

        for lot, source_location in prepared:
            key = (lot.product_id.id, source_location.id)

            move = moves_by_key.get(key)
            if not move:
                move = self.env['stock.move'].create({
                    'name': lot.product_id.display_name,
                    'product_id': lot.product_id.id,
                    'product_uom_qty': 0.0,
                    'product_uom': lot.product_id.uom_id.id,
                    'picking_id': picking.id,
                    'location_id': source_location.id,
                    'location_dest_id': truck_location.id,
                    'origin': picking.origin or picking.name,
                })
                moves_by_key[key] = move

            move.product_uom_qty += 1.0

            self.env['stock.move.line'].create({
                'move_id': move.id,
                'picking_id': picking.id,
                'product_id': lot.product_id.id,
                'product_uom_id': lot.product_id.uom_id.id,
                'qty_done': 1.0,
                'lot_id': lot.id,
                'location_id': source_location.id,
                'location_dest_id': truck_location.id,
            })

        if picking.state == 'draft':
            picking.action_confirm()

        # Importante: no dependemos de reserva para validar; las líneas ya tienen qty_done.
        result = picking.button_validate()

        if isinstance(result, dict):
            # Si Odoo abre wizard de backorder/immediate transfer, lo dejamos informado.
            return {
                'ok': True,
                'picking_id': picking.id,
                'picking_name': picking.name,
                'message': _('Recogida creada. Revisa la validación final de Odoo: %s') % picking.name,
                'action': result,
            }

        return {
            'ok': True,
            'picking_id': picking.id,
            'picking_name': picking.name,
            'message': _('Recogida validada correctamente: %s') % picking.name,
        }


    def trigas_tri3_add_serial_real_location_line(self, serial_name):
        self.ensure_one()

        serial_name = (serial_name or '').strip()

        if not serial_name:
            return {
                'ok': False,
                'message': _('Lectura vacía.'),
            }

        if not self.picking_type_id or self.picking_type_id.sequence_code != 'TRI3':
            return {
                'ok': False,
                'message': _('Este método solo aplica a Recogida de Cilindros TRI3.'),
            }

        lot = self.env['stock.lot'].search([
            ('name', '=', serial_name),
        ], limit=1)

        if not lot:
            return {
                'ok': False,
                'message': _('No se encontró el serial: %s') % serial_name,
            }

        if not lot.product_id or not lot.product_id.product_tmpl_id.is_cylinder_conduce:
            return {
                'ok': False,
                'message': _('El serial %s no pertenece a un producto marcado como cilindro Trigas.') % serial_name,
            }

        duplicate_line = self.move_line_ids.filtered(
            lambda ml: ml.lot_id.id == lot.id and ml.qty_done > 0
        )

        if duplicate_line:
            return {
                'ok': False,
                'message': _('El serial %s ya fue leído en esta recogida.') % serial_name,
            }

        quants = self.env['stock.quant'].search([
            ('lot_id', '=', lot.id),
            ('quantity', '>', 0),
        ])

        quants = quants.filtered(
            lambda q: q.location_id
            and q.location_id.usage in ('internal', 'customer')
        )

        if not quants:
            return {
                'ok': False,
                'message': _('El serial %s no tiene existencia disponible.') % serial_name,
            }

        # Tomamos la ubicación real más reciente del serial.
        quant = quants.sorted(lambda q: q.in_date or q.create_date, reverse=True)[:1]
        source_location = quant.location_id
        destination_location = self.location_dest_id or self.picking_type_id.default_location_dest_id

        if not destination_location:
            return {
                'ok': False,
                'message': _('Esta recogida no tiene ubicación destino definida.'),
            }

        # Si el picking está vacío, ajustar origen del encabezado para que Barcode renderice mejor.
        if not self.move_line_ids:
            self.write({
                'location_id': source_location.id,
                'location_dest_id': destination_location.id,
            })

        if self.state == 'draft':
            self.action_confirm()

        # Crear un movimiento por serial para evitar agrupaciones incorrectas.
        move = self.env['stock.move'].create({
            'name': '%s - %s' % (lot.product_id.display_name, lot.name),
            'product_id': lot.product_id.id,
            'product_uom_qty': 1.0,
            'product_uom': lot.product_id.uom_id.id,
            'picking_id': self.id,
            'location_id': source_location.id,
            'location_dest_id': destination_location.id,
            'origin': self.origin or self.name,
        })

        line = self.env['stock.move.line'].create({
            'move_id': move.id,
            'picking_id': self.id,
            'product_id': lot.product_id.id,
            'product_uom_id': lot.product_id.uom_id.id,
            'lot_id': lot.id,
            'qty_done': 1.0,
            'location_id': source_location.id,
            'location_dest_id': destination_location.id,
        })

        return {
            'ok': True,
            'message': _('Serial agregado: %(serial)s | Origen: %(src)s | Destino: %(dest)s') % {
                'serial': lot.name,
                'src': source_location.display_name,
                'dest': destination_location.display_name,
            },
            'serial': lot.name,
            'product': lot.product_id.display_name,
            'source_location_id': source_location.id,
            'source_location_name': source_location.display_name,
            'destination_location_id': destination_location.id,
            'destination_location_name': destination_location.display_name,
            'move_id': move.id,
            'move_line_id': line.id,
        }


    def trigas_tri3_validate_serial_frontend_only(self, serial_name):
        self.ensure_one()

        serial_name = (serial_name or '').strip()

        if not serial_name:
            return {
                'ok': False,
                'message': _('Lectura vacía.'),
            }

        if not self.picking_type_id or self.picking_type_id.sequence_code != 'TRI3':
            return {
                'ok': False,
                'message': _('Este método solo aplica a Recogida de Cilindros TRI3.'),
            }

        lot = self.env['stock.lot'].search([
            ('name', '=', serial_name),
        ], limit=1)

        if not lot:
            return {
                'ok': False,
                'message': _('No se encontró el serial: %s') % serial_name,
            }

        if not lot.product_id or not lot.product_id.product_tmpl_id.is_cylinder_conduce:
            return {
                'ok': False,
                'message': _('El serial %s no pertenece a un producto marcado como cilindro Trigas.') % serial_name,
            }

        quants = self.env['stock.quant'].search([
            ('lot_id', '=', lot.id),
            ('quantity', '>', 0),
        ])

        quants = quants.filtered(
            lambda q: q.location_id
            and q.location_id.usage in ('internal', 'customer')
        )

        if not quants:
            return {
                'ok': False,
                'message': _('El serial %s no tiene existencia disponible.') % serial_name,
            }

        quant = quants.sorted(lambda q: q.in_date or q.create_date, reverse=True)[:1]
        source_location = quant.location_id
        destination_location = self.location_dest_id or self.picking_type_id.default_location_dest_id

        if not destination_location:
            return {
                'ok': False,
                'message': _('Esta recogida no tiene ubicación destino definida.'),
            }

        return {
            'ok': True,
            'serial': lot.name,
            'lot_id': lot.id,
            'product': lot.product_id.display_name,
            'product_id': lot.product_id.id,
            'source_location_id': source_location.id,
            'source_location_name': source_location.display_name,
            'destination_location_id': destination_location.id,
            'destination_location_name': destination_location.display_name,
            'message': _('Serial leído: %(serial)s | Origen: %(src)s') % {
                'serial': lot.name,
                'src': source_location.display_name,
            },
        }

    def trigas_tri3_commit_frontend_serials(self, serial_names):
        self.ensure_one()

        serial_names = [s.strip() for s in (serial_names or []) if s and s.strip()]
        serial_names = list(dict.fromkeys(serial_names))

        if not serial_names:
            return {
                'ok': False,
                'message': _('Debes leer al menos un serial antes de validar.'),
            }

        if not self.picking_type_id or self.picking_type_id.sequence_code != 'TRI3':
            return {
                'ok': False,
                'message': _('Este método solo aplica a Recogida de Cilindros TRI3.'),
            }

        destination_location = self.location_dest_id or self.picking_type_id.default_location_dest_id

        if not destination_location:
            return {
                'ok': False,
                'message': _('Esta recogida no tiene ubicación destino definida.'),
            }

        created_lines = []

        # Limpieza defensiva: si había líneas nativas mal agrupadas en este picking de prueba,
        # las eliminamos antes de crear las líneas reales desde frontend.
        if self.state == 'draft':
            self.move_line_ids.unlink()
            self.move_ids_without_package.unlink()

        first_source = False

        for serial_name in serial_names:
            lot = self.env['stock.lot'].search([
                ('name', '=', serial_name),
            ], limit=1)

            if not lot:
                raise UserError(_('No se encontró el serial: %s') % serial_name)

            if not lot.product_id or not lot.product_id.product_tmpl_id.is_cylinder_conduce:
                raise UserError(_('El serial %s no pertenece a un producto marcado como cilindro Trigas.') % serial_name)

            duplicate_line = self.move_line_ids.filtered(
                lambda ml: ml.lot_id.id == lot.id and ml.qty_done > 0
            )

            if duplicate_line:
                continue

            quants = self.env['stock.quant'].search([
                ('lot_id', '=', lot.id),
                ('quantity', '>', 0),
            ])

            quants = quants.filtered(
                lambda q: q.location_id
                and q.location_id.usage in ('internal', 'customer')
            )

            if not quants:
                raise UserError(_('El serial %s no tiene existencia disponible.') % serial_name)

            quant = quants.sorted(lambda q: q.in_date or q.create_date, reverse=True)[:1]
            source_location = quant.location_id

            if not first_source:
                first_source = source_location

            move = self.env['stock.move'].create({
                'name': '%s - %s' % (lot.product_id.display_name, lot.name),
                'product_id': lot.product_id.id,
                'product_uom_qty': 1.0,
                'product_uom': lot.product_id.uom_id.id,
                'picking_id': self.id,
                'location_id': source_location.id,
                'location_dest_id': destination_location.id,
                'origin': self.origin or self.name,
            })

            line = self.env['stock.move.line'].create({
                'move_id': move.id,
                'picking_id': self.id,
                'product_id': lot.product_id.id,
                'product_uom_id': lot.product_id.uom_id.id,
                'lot_id': lot.id,
                'qty_done': 1.0,
                'location_id': source_location.id,
                'location_dest_id': destination_location.id,
            })

            created_lines.append(line.id)

        if first_source and self.state == 'draft':
            self.write({
                'location_id': first_source.id,
                'location_dest_id': destination_location.id,
            })

        if self.state == 'draft':
            self.action_confirm()

        result = self.button_validate()

        if isinstance(result, dict):
            return {
                'ok': True,
                'message': _('Seriales guardados. Odoo requiere una confirmación adicional.'),
                'action': result,
                'picking_id': self.id,
                'picking_name': self.name,
            }

        return {
            'ok': True,
            'message': _('Recogida validada correctamente: %s') % self.name,
            'picking_id': self.id,
            'picking_name': self.name,
            'created_line_ids': created_lines,
        }



    def trigas_tri3_add_serial_from_any_origin(self, serial_name):
        self.ensure_one()

        serial_name = (serial_name or '').strip()

        if not serial_name:
            return {
                'ok': False,
                'message': _('Lectura vacía.'),
            }

        if not self.picking_type_id or self.picking_type_id.sequence_code != 'TRI3':
            return {
                'ok': False,
                'message': _('Este método solo aplica a Recogida de Cilindros TRI3.'),
            }

        lot = self.env['stock.lot'].search([
            ('name', '=', serial_name),
        ], limit=1)

        if not lot:
            return {
                'ok': False,
                'message': _('No se encontró el serial: %s') % serial_name,
            }

        if not lot.product_id or not lot.product_id.product_tmpl_id.is_cylinder_conduce:
            return {
                'ok': False,
                'message': _('El serial %s no pertenece a un producto marcado como cilindro Trigas.') % serial_name,
            }

        duplicate_line = self.move_line_ids.filtered(
            lambda ml: ml.lot_id.id == lot.id and ml.qty_done > 0
        )

        if duplicate_line:
            return {
                'ok': False,
                'message': _('El serial %s ya fue leído en esta recogida.') % serial_name,
            }

        quants = self.env['stock.quant'].search([
            ('lot_id', '=', lot.id),
            ('quantity', '>', 0),
        ])

        quants = quants.filtered(
            lambda q: q.location_id
            and q.location_id.usage in ('internal', 'customer')
        )

        if not quants:
            return {
                'ok': False,
                'message': _('El serial %s no tiene existencia disponible.') % serial_name,
            }

        # Priorizar ubicaciones reconocidas como de Trigas sobre cualquier
        # otra, para evitar que un quant mas reciente de otro modulo (ej.
        # Rental) se elija por error como la ubicacion "correcta".
        trigas_quants = quants.filtered(
            lambda q: (q.location_id.complete_name or '').startswith(('TRIGA/', 'CLIENTES_TRIGAS/'))
        )
        candidate_quants = trigas_quants or quants

        # Ubicación real actual del serial.
        quant = candidate_quants.sorted(lambda q: q.in_date or q.create_date, reverse=True)[:1]
        source_location = quant.location_id
        destination_location = self.location_dest_id or self.picking_type_id.default_location_dest_id

        if not destination_location:
            return {
                'ok': False,
                'message': _('Esta recogida no tiene ubicación destino definida.'),
            }

        if len(quants) > 1:
            self.env['stock.quant']._trigas_force_correct_serial_location(
                lot.product_id, lot, source_location
            )

        # Si el picking está vacío, ajustamos el encabezado al primer origen real.
        # Las líneas posteriores pueden tener otros orígenes.
        if not self.move_line_ids and self.location_id.id != source_location.id:
            self.write({
                'location_id': source_location.id,
                'location_dest_id': destination_location.id,
            })

        # Usar/crear un move por producto + origen real + destino.
        move = self.move_ids_without_package.filtered(
            lambda m:
                m.product_id.id == lot.product_id.id
                and m.location_id.id == source_location.id
                and m.location_dest_id.id == destination_location.id
                and m.state not in ('done', 'cancel')
        )[:1]

        if not move:
            move = self.env['stock.move'].create({
                'name': lot.product_id.display_name,
                'product_id': lot.product_id.id,
                'product_uom_qty': 1.0,
                'product_uom': lot.product_id.uom_id.id,
                'picking_id': self.id,
                'location_id': source_location.id,
                'location_dest_id': destination_location.id,
                'origin': self.origin or self.name,
            })
        else:
            move.product_uom_qty = move.product_uom_qty + 1.0

        if self.state == 'draft':
            self.action_confirm()

        # Releer move por si cambió de estado después de action_confirm.
        move = self.env['stock.move'].browse(move.id).exists()

        line = self.env['stock.move.line'].create({
            'move_id': move.id,
            'picking_id': self.id,
            'product_id': lot.product_id.id,
            'product_uom_id': lot.product_id.uom_id.id,
            'lot_id': lot.id,
            'qty_done': 1.0,
            'location_id': source_location.id,
            'location_dest_id': destination_location.id,
        })

        return {
            'ok': True,
            'message': _('Serial agregado: %(serial)s | Origen: %(src)s | Destino: %(dest)s') % {
                'serial': lot.name,
                'src': source_location.display_name,
                'dest': destination_location.display_name,
            },
            'serial': lot.name,
            'product': lot.product_id.display_name,
            'source_location_id': source_location.id,
            'source_location_name': source_location.display_name,
            'destination_location_id': destination_location.id,
            'destination_location_name': destination_location.display_name,
            'move_id': move.id,
            'move_line_id': line.id,
        }



    def trigas_tri3_set_truck_destination_from_barcode(self, location_barcode):
        self.ensure_one()

        location_barcode = (location_barcode or '').strip()

        if not location_barcode:
            return {
                'ok': False,
                'message': _('Lectura vacía.'),
            }

        if not self.picking_type_id or self.picking_type_id.sequence_code != 'TRI3':
            return {
                'ok': False,
                'message': _('Este método solo aplica a Recogida de Cilindros TRI3.'),
            }

        Location = self.env['stock.location']

        location = Location.search([
            ('barcode', '=', location_barcode),
        ], limit=1)

        if not location:
            location = Location.search([
                ('name', '=', location_barcode),
            ], limit=1)

        if not location:
            location = Location.search([
                ('complete_name', '=', location_barcode),
            ], limit=1)

        if not location:
            return {
                'ok': False,
                'message': _('No se encontró la ubicación: %s') % location_barcode,
            }

        if location.usage != 'internal':
            return {
                'ok': False,
                'message': _('La ubicación destino debe ser interna: %s') % location.display_name,
            }

        if not location.is_trigas_truck_location:
            return {
                'ok': False,
                'message': _('No es una ubicación camión Trigas: %s') % location.display_name,
            }

        if not self.move_line_ids:
            return {
                'ok': False,
                'message': _('Primero debes escanear al menos un serial antes de indicar el camión destino.'),
            }

        # En TRI3 cada línea puede tener un origen diferente.
        # La ubicación leída representa el destino común: camión.
        self.write({
            'location_dest_id': location.id,
            'trigas_truck_location_id': location.id if 'trigas_truck_location_id' in self._fields else False,
        })

        for move in self.move_ids_without_package:
            if move.state not in ('done', 'cancel'):
                move.location_dest_id = location.id

        for line in self.move_line_ids:
            if line.state not in ('done', 'cancel'):
                line.location_dest_id = location.id

        return {
            'ok': True,
            'message': _('Ubicación destino registrada: %s') % location.display_name,
            'location_id': location.id,
            'location_name': location.display_name,
        }


    def trigas_barcode_get_step_3_state(self):
        self.ensure_one()

        if not self._trigas_barcode_is_pickup_step():
            return {
                'ok': False,
                'message': _('Este método solo aplica al Conduce de Recogida.'),
            }

        groups = self._trigas_get_step_3_pickup_groups()
        truck_location = self.trigas_truck_location_id or False

        return {
            'ok': True,
            'groups': groups,
            'has_serials': bool(groups),
            'truck_location_id': truck_location.id if truck_location else False,
            'truck_location_name': truck_location.display_name if truck_location else '',
            'has_truck': bool(truck_location),
            'can_validate': bool(groups and truck_location),
        }

    def trigas_barcode_validate_step_3_from_pda(self):
        self.ensure_one()

        if not self._trigas_barcode_is_pickup_step():
            return {
                'ok': False,
                'message': _('Este método solo aplica al Conduce de Recogida.'),
            }

        self._trigas_prepare_step_3_before_validate()

        result = self.button_validate()

        return {
            'ok': True,
            'picking_id': self.id,
            'picking_name': self.name,
            'state': self.state,
            'message': _('Recogida validada correctamente: %s') % self.name,
            'result': bool(result),
        }

    def trigas_barcode_cancel_step_3_from_pda(self):
        self.ensure_one()

        if not self._trigas_barcode_is_pickup_step():
            return {
                'ok': False,
                'message': _('Este método solo aplica al Conduce de Recogida.'),
            }

        if self.state == 'done':
            raise UserError(_('No puedes cancelar una recogida ya validada.'))

        if self.state != 'cancel':
            self.action_cancel()

        return {
            'ok': True,
            'picking_id': self.id,
            'picking_name': self.name,
            'state': self.state,
            'message': _('Recogida cancelada correctamente: %s') % self.name,
        }

    def _trigas_prepare_step_1_before_validate(self):
        self.ensure_one()

        allowed_moves = self.move_ids_without_package.filtered(
            lambda m: m.product_id.product_tmpl_id.is_cylinder_conduce
        )

        if not allowed_moves:
            raise UserError(_('No existen productos de cilindros configurados para este Conduce 1.'))

        allowed_product_ids = allowed_moves.mapped('product_id').ids
        expected_qty = sum(allowed_moves.mapped('product_uom_qty'))

        # Las líneas con lot_id pero qty_done = 0 son reservas/restos viejos, no lecturas PDA.
        # Si se convierten a hechas, contaminan el conteo y bloquean la validación.
        stale_serial_lines = self.move_line_ids.filtered(
            lambda ml: (
                ml.lot_id
                and ml.product_id.id in allowed_product_ids
                and ml.qty_done <= 0
            )
        )
        stale_serial_lines.unlink()

        done_serial_lines = self.move_line_ids.filtered(
            lambda ml: (
                ml.lot_id
                and ml.product_id.id in allowed_product_ids
                and ml.qty_done > 0
            )
        )

        if not done_serial_lines:
            raise UserError(_('Debes registrar los seriales en el Conduce 1 antes de validar.'))

        if len(done_serial_lines) != expected_qty:
            raise UserError(_(
                'La cantidad de seriales escaneados no coincide con la orden. '
                'Cantidad esperada: %s. Cantidad escaneada: %s.'
            ) % (expected_qty, len(done_serial_lines)))

        duplicated_lots = []
        seen_lots = set()

        for line in done_serial_lines:
            if line.lot_id.id in seen_lots:
                duplicated_lots.append(line.lot_id.name)
            seen_lots.add(line.lot_id.id)

            if line.product_id.id not in allowed_product_ids:
                raise UserError(_(
                    'El serial %s pertenece al producto %s, pero ese producto no está definido en esta orden.'
                ) % (line.lot_id.name, line.product_id.display_name))

            if line.lot_id.product_id.id != line.product_id.id:
                raise UserError(_(
                    'El serial %s no corresponde al producto de la línea escaneada.'
                ) % line.lot_id.name)

        if duplicated_lots:
            raise UserError(_(
                'Hay seriales repetidos en el Conduce 1: %s'
            ) % ', '.join(duplicated_lots))

        truck_location = self._trigas_resolve_truck_location(_('Conduce 1'))

        self.location_dest_id = truck_location.id

        for move in self.move_ids_without_package:
            move.location_dest_id = truck_location.id

        for move_line in self.move_line_ids:
            move_line.location_dest_id = truck_location.id

    def _trigas_prepare_step_2_before_validate(self):
        self.ensure_one()

        # TRIGAS FIX CONDUCE 2:
        # En la PDA/Odoo Barcode los seriales pueden quedar con lot_id pero qty_done = 0.
        # También pueden duplicarse: una línea sin reserva y otra reservada.
        # Antes de validar, dejamos una sola línea por serial, preferimos la reservada
        # y marcamos qty_done = 1.0 para que Odoo valide la entrega real.
        serial_lines = self.move_line_ids.filtered(
            lambda ml: ml.lot_id and ml.product_id.product_tmpl_id.is_cylinder_conduce
        )

        lines_by_lot = {}
        for line in serial_lines:
            lines_by_lot.setdefault(line.lot_id.id, self.env['stock.move.line'])
            lines_by_lot[line.lot_id.id] |= line

        lines_to_keep = self.env['stock.move.line']
        lines_to_delete = self.env['stock.move.line']

        for lot_id, lines in lines_by_lot.items():
            sorted_lines = lines.sorted(
                key=lambda ml: ((ml.reserved_uom_qty or 0.0), ml.id),
                reverse=True,
            )
            keep_line = sorted_lines[:1]
            lines_to_keep |= keep_line
            lines_to_delete |= (sorted_lines - keep_line)

        for line in lines_to_keep:
            if line.qty_done <= 0:
                line.qty_done = 1.0

        if lines_to_delete:
            lines_to_delete.unlink()

        done_serial_lines = self.move_line_ids.filtered(
            lambda ml: ml.lot_id and ml.qty_done > 0 and ml.product_id.product_tmpl_id.is_cylinder_conduce
        )
        if not done_serial_lines:
            raise UserError(_('Debes registrar los seriales en el Conduce 2 antes de validar.'))

        customer_location = self._trigas_resolve_customer_location()

        sale_order = self.sale_order_id
        if sale_order:
            for move in self.move_ids_without_package:
                if not move.sale_line_id:
                    sale_line = sale_order.order_line.filtered(
                        lambda line: line.product_id.id == move.product_id.id
                    )[:1]
                    if sale_line:
                        move.sale_line_id = sale_line.id

        if not self.trigas_customer_location_scanned:
            raise UserError(_('Debes escanear la ubicación del cliente antes de validar el Conduce 2.'))

        if not self.trigas_delivery_signature:
            raise UserError(_('Debes registrar la firma del cliente antes de validar el Conduce 2.'))

        self.location_dest_id = customer_location.id

        for move in self.move_ids_without_package:
            move.location_dest_id = customer_location.id

        for move_line in self.move_line_ids:
            move_line.location_dest_id = customer_location.id
