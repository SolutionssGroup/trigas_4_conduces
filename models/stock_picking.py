from odoo import api, fields, models, _
from odoo.exceptions import UserError


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    is_trigas_conduce = fields.Boolean(
        string='Es conduce Trigas',
        default=False,
        copy=False
    )

    trigas_step = fields.Selection([
        ('1', 'Conduce 1'),
        ('2', 'Conduce 2'),
    ], string='Paso flujo Trigas', copy=False)

    sale_order_id = fields.Many2one(
        'sale.order',
        string='Orden de venta',
        copy=False
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

    trigas_delivery_signature_status = fields.Selection([
        ('pending', 'Pendiente'),
        ('signed', 'Firmado'),
    ], string='Estado de firma', compute='_compute_trigas_delivery_signature_status', store=True)

    @api.depends('trigas_delivery_signature')
    def _compute_trigas_delivery_signature_status(self):
        for picking in self:
            picking.trigas_delivery_signature_status = 'signed' if picking.trigas_delivery_signature else 'pending'

    def action_open_trigas_signature_wizard(self):
        self.ensure_one()

        if not self.is_trigas_conduce or self.trigas_step != '2':
            raise UserError(_('La firma solo aplica al Conduce 2.'))

        return {
            'type': 'ir.actions.act_window',
            'name': _('Firma de entrega'),
            'res_model': 'trigas.delivery.signature.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_picking_id': self.id,
                'default_signed_by': self.partner_id.name or '',
            }
        }

    def trigas_barcode_save_delivery_signature(self, signed_by, signature_base64):
        self.ensure_one()

        if not self.is_trigas_conduce or self.trigas_step != '2':
            raise UserError(_('La firma solo puede registrarse en el Conduce 2.'))

        if not signed_by or not signed_by.strip():
            raise UserError(_('Debes indicar el nombre de quien recibe.'))

        if not signature_base64:
            raise UserError(_('Debes capturar la firma antes de guardar.'))

        if isinstance(signature_base64, str) and 'base64,' in signature_base64:
            signature_base64 = signature_base64.split('base64,', 1)[1]

        self.write({
            'trigas_delivery_signature': signature_base64,
            'trigas_delivery_signed_by': signed_by.strip(),
            'trigas_delivery_signed_on': fields.Datetime.now(),
            'trigas_delivery_signature_filename': 'firma_conduce_%s.png' % (self.name or self.id),
        })

        return True

    def action_send_trigas_delivery_email(self):
        self.ensure_one()

        if not self.is_trigas_conduce or self.trigas_step != '2':
            raise UserError(_('El envío de firma por correo solo aplica al Conduce 2.'))

        if not self.partner_id.email:
            raise UserError(_('El cliente no tiene un correo electrónico definido.'))

        if not self.trigas_delivery_signature:
            raise UserError(_('Debes registrar una firma antes de enviarla por correo.'))

        template = self.env.ref('trigas_4_conduces.mail_template_trigas_delivery_signature', raise_if_not_found=False)
        if not template:
            raise UserError(_('No se encontró la plantilla de correo de firma de entrega.'))

        template.send_mail(self.id, force_send=True)
        return True

    def button_validate(self):
        for picking in self:
            if picking.is_trigas_conduce:
                if picking.trigas_step == '1':
                    picking._trigas_prepare_step_1_before_validate()
                elif picking.trigas_step == '2':
                    picking._trigas_prepare_step_2_before_validate()
            elif picking._trigas_is_native_internal_transfer():
                picking._trigas_prepare_native_internal_transfer_before_validate()

        res = super().button_validate()

        for picking in self:
            if not picking.is_trigas_conduce or not picking.sale_order_id:
                continue

            if picking.trigas_step == '1':
                picking.sale_order_id._after_validate_trigas_step_1(picking)

        return res

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
                and ml.location_dest_id.usage == 'internal'
                and ml.location_dest_id.id not in pending_locations.ids
                and ml.location_dest_id.id != self.location_id.id
            )
        )
        candidate_locations |= done_lines.mapped('location_dest_id')

        if (
            self.location_dest_id
            and self.location_dest_id.usage == 'internal'
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

        if location.usage != 'internal':
            raise UserError(_('La ubicación escaneada del cliente debe ser de tipo interna.'))

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
        })

        self.move_ids_without_package.write({
            'location_dest_id': location.id,
        })

        self.move_line_ids.write({
            'location_dest_id': location.id,
        })

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
            raise UserError(_(
                'El serial %s ya fue escaneado en este conduce.'
            ) % lot.name)

        allowed_lots = self._trigas_get_allowed_lot_ids_for_step_2()
        if not allowed_lots or lot.id not in allowed_lots.ids:
            raise UserError(_(
                'El serial %s no pertenece a esta orden para entrega al cliente.'
            ) % lot.name)

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
            ('location_id.usage', '=', 'internal'),
        ])

        locations = quants.mapped('location_id').exists()

        if not locations:
            raise UserError(_(
                'El serial %s no tiene existencia disponible en una ubicación interna.'
            ) % lot.name)

        if len(locations) > 1:
            raise UserError(_(
                'El serial %s existe en múltiples ubicaciones internas. '
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

        if not reference_location:
            self.write({
                'trigas_native_source_location_id': source_location.id,
                'location_id': source_location.id,
            })

        return {
            'location_id': source_location.id,
            'location_name': source_location.display_name,
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
        if source_location and source_location.id == location.id:
            raise UserError(_('La ubicación destino no puede ser igual a la ubicación origen.'))

        self.write({
            'location_dest_id': location.id,
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

        done_serial_lines = self.move_line_ids.filtered(
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

    def _trigas_prepare_step_1_before_validate(self):
        self.ensure_one()

        done_serial_lines = self.move_line_ids.filtered(
            lambda ml: ml.lot_id and ml.qty_done > 0 and ml.product_id.product_tmpl_id.is_cylinder_conduce
        )
        if not done_serial_lines:
            raise UserError(_('Debes registrar los seriales en el Conduce 1 antes de validar.'))

        truck_location = self._trigas_resolve_truck_location(_('Conduce 1'))

        self.location_dest_id = truck_location.id

        for move in self.move_ids_without_package:
            move.location_dest_id = truck_location.id

        for move_line in self.move_line_ids:
            move_line.location_dest_id = truck_location.id

    def _trigas_prepare_step_2_before_validate(self):
        self.ensure_one()

        done_serial_lines = self.move_line_ids.filtered(
            lambda ml: ml.lot_id and ml.qty_done > 0 and ml.product_id.product_tmpl_id.is_cylinder_conduce
        )
        if not done_serial_lines:
            raise UserError(_('Debes registrar los seriales en el Conduce 2 antes de validar.'))

        customer_location = self._trigas_resolve_customer_location()

        self.location_dest_id = customer_location.id

        for move in self.move_ids_without_package:
            move.location_dest_id = customer_location.id

        for move_line in self.move_line_ids:
            move_line.location_dest_id = customer_location.id