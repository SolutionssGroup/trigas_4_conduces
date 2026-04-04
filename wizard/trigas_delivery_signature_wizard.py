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

        if not self.picking_id.is_trigas_conduce or self.picking_id.trigas_step != '2':
            raise UserError(_('La firma solo puede guardarse en Conduce 2.'))

        if not self.signature:
            raise UserError(_('Debes capturar la firma antes de guardar.'))

        self.picking_id.write({
            'trigas_delivery_signature': self.signature,
            'trigas_delivery_signed_by': self.signed_by,
            'trigas_delivery_signed_on': fields.Datetime.now(),
            'trigas_delivery_signature_filename': 'firma_conduce_%s.png' % self.picking_id.name,
        })

        return {'type': 'ir.actions.act_window_close'}