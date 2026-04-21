from odoo import fields, models, _
from odoo.exceptions import UserError


class TrigasDeliverySignatureWizard(models.TransientModel):
    _name = 'trigas.delivery.signature.wizard'
    _description = 'Firma de entrega Trigas'

    picking_id = fields.Many2one(
        'stock.picking',
        string='Conduce',
        required=True,
        readonly=True
    )

    signed_by = fields.Char(
        string='Nombre de quien recibe',
        required=True
    )

    signature = fields.Binary(
        string='Firma',
        required=True
    )

    def action_save_signature(self):
        self.ensure_one()

        if not self.picking_id:
            raise UserError(_('No se encontró el conduce.'))

        self.picking_id.trigas_barcode_save_delivery_signature(
            self.signed_by,
            self.signature,
        )

        return {'type': 'ir.actions.act_window_close'}
