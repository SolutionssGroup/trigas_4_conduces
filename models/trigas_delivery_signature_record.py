from base64 import b64encode

from odoo import api, fields, models, _
from odoo.exceptions import UserError


class TrigasDeliverySignatureRecord(models.Model):
    _name = 'trigas.delivery.signature.record'
    _description = 'Histórico de firmas de entrega Trigas'
    _order = 'signed_on desc, id desc'

    name = fields.Char(
        string='Referencia',
        compute='_compute_name',
        store=True
    )

    picking_id = fields.Many2one(
        'stock.picking',
        string='Conduce',
        required=True,
        ondelete='cascade',
        index=True
    )

    sale_order_id = fields.Many2one(
        'sale.order',
        string='Orden de venta',
        related='picking_id.sale_order_id',
        store=True,
        readonly=True
    )

    partner_id = fields.Many2one(
        'res.partner',
        string='Cliente',
        related='picking_id.partner_id',
        store=True,
        readonly=True
    )

    customer_location_id = fields.Many2one(
        'stock.location',
        string='Ubicación cliente',
        related='picking_id.trigas_customer_location_id',
        store=True,
        readonly=True
    )

    customer_location_barcode = fields.Char(
        string='Barcode ubicación cliente',
        related='sale_order_id.trigas_customer_location_barcode',
        store=True,
        readonly=True
    )

    signed_by = fields.Char(
        string='Firmado por',
        required=True
    )

    signed_on = fields.Datetime(
        string='Fecha de firma',
        required=True
    )

    signature_image = fields.Binary(
        string='Firma',
        attachment=True,
        required=True
    )

    signature_filename = fields.Char(
        string='Nombre archivo firma'
    )

    pdf_attachment_id = fields.Many2one(
        'ir.attachment',
        string='PDF firmado',
        copy=False,
        readonly=True
    )

    state = fields.Selection([
        ('signed', 'Firmado'),
        ('emailed', 'Enviado'),
    ], string='Estado', default='signed', required=True, copy=False)

    notes = fields.Text(
        string='Notas'
    )

    @api.depends('picking_id', 'signed_on')
    def _compute_name(self):
        for rec in self:
            if rec.picking_id and rec.signed_on:
                rec.name = '%s - %s' % (
                    rec.picking_id.name or _('Conduce'),
                    fields.Datetime.context_timestamp(rec, rec.signed_on).strftime('%d/%m/%Y %I:%M %p')
                )
            elif rec.picking_id:
                rec.name = rec.picking_id.name
            else:
                rec.name = _('Firma Trigas')

    def _trigas_format_datetime(self, value):
        self.ensure_one()
        if not value:
            return ''
        return fields.Datetime.context_timestamp(self, value).strftime('%d/%m/%Y %I:%M %p')

    def _get_trigas_signature_serial_lines(self):
        self.ensure_one()

        picking = self.picking_id
        if not picking:
            return []

        move_lines = picking.move_line_ids.filtered(
            lambda ml: ml.lot_id
            and ml.qty_done > 0
            and ml.product_id
            and ml.product_id.product_tmpl_id.is_cylinder_conduce
        ).sorted(lambda ml: (
            ml.product_id.display_name or '',
            ml.lot_id.name or '',
            ml.id,
        ))

        lines = []
        for index, move_line in enumerate(move_lines, start=1):
            lines.append({
                'sequence': index,
                'product': move_line.product_id.display_name or '',
                'serial': move_line.lot_id.name or '',
                'qty_done': move_line.qty_done,
                'uom': move_line.product_uom_id.name or move_line.product_id.uom_id.name or '',
                'source_location': move_line.location_id.display_name or '',
                'dest_location': move_line.location_dest_id.display_name or '',
            })

        if lines:
            return lines

        if self.sale_order_id and self.sale_order_id.trigas_flow_lot_ids:
            lots = self.sale_order_id.trigas_flow_lot_ids.sorted(lambda lot: (
                lot.product_id.display_name or '',
                lot.name or '',
                lot.id,
            ))
            for index, lot in enumerate(lots, start=1):
                lines.append({
                    'sequence': index,
                    'product': lot.product_id.display_name or '',
                    'serial': lot.name or '',
                    'qty_done': 1.0,
                    'uom': lot.product_id.uom_id.name or '',
                    'source_location': '',
                    'dest_location': self.customer_location_id.display_name or '',
                })

        return lines

    def action_generate_pdf_attachment(self):
        for rec in self:
            report = self.env.ref('trigas_4_conduces.action_report_trigas_delivery_signature_record', raise_if_not_found=False)
            if not report:
                raise UserError(_('No se encontró el reporte PDF de firma de entrega.'))

            pdf_content, _content_type = report._render_qweb_pdf(
                report.report_name,
                res_ids=[rec.id],
            )

            filename = 'Firma_Entrega_%s.pdf' % (rec.picking_id.name or rec.id)
            pdf_b64 = b64encode(pdf_content)

            if rec.pdf_attachment_id:
                rec.pdf_attachment_id.write({
                    'name': filename,
                    'datas': pdf_b64,
                    'mimetype': 'application/pdf',
                    'res_model': rec._name,
                    'res_id': rec.id,
                })
            else:
                attachment = self.env['ir.attachment'].create({
                    'name': filename,
                    'type': 'binary',
                    'datas': pdf_b64,
                    'mimetype': 'application/pdf',
                    'res_model': rec._name,
                    'res_id': rec.id,
                })
                rec.pdf_attachment_id = attachment.id
        return True

    def action_download_pdf(self):
        self.ensure_one()
        if not self.pdf_attachment_id:
            self.action_generate_pdf_attachment()

        return {
            'type': 'ir.actions.act_url',
            'url': '/web/content/%s?download=true' % self.pdf_attachment_id.id,
            'target': 'self',
        }

    def action_open_related_picking(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Conduce'),
            'res_model': 'stock.picking',
            'res_id': self.picking_id.id,
            'view_mode': 'form',
            'target': 'current',
        }
