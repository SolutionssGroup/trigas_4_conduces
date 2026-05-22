from odoo import api, models, _
from odoo.exceptions import ValidationError


class StockQuant(models.Model):
    _inherit = 'stock.quant'

    @api.constrains('product_id', 'lot_id', 'location_id', 'quantity')
    def _check_trigas_serial_not_in_multiple_locations(self):
        """
        Regla Trigas:
        Si el producto usa trazabilidad por número de serie,
        el mismo Lot/Serial no puede tener existencia positiva
        en más de una ubicación real.
        """
        valid_usages = ['internal', 'customer', 'transit']

        for quant in self:
            if not quant.lot_id:
                continue

            if quant.quantity <= 0:
                continue

            if quant.location_id.usage not in valid_usages:
                continue

            if quant.product_id.tracking != 'serial':
                continue

            if (quant.lot_id.name or '').startswith('DUPLICADO_REMOVIDO_'):
                continue

            other_quants = self.search([
                ('id', '!=', quant.id),
                ('lot_id', '=', quant.lot_id.id),
                ('quantity', '>', 0),
                ('location_id.usage', 'in', valid_usages),
            ])

            other_quants = other_quants.filtered(
                lambda q: q.location_id.id != quant.location_id.id
            )

            if other_quants:
                locations = "\n".join([
                    "- %s | Cantidad: %s" % (q.location_id.display_name, q.quantity)
                    for q in other_quants
                ])

                raise ValidationError(_(
                    "No se puede ubicar este serial en más de una ubicación.\n\n"
                    "Serial: %s\n"
                    "Producto: %s\n"
                    "Ubicación actual: %s\n\n"
                    "El mismo serial ya tiene existencia positiva en:\n%s\n\n"
                    "Primero debe depurarse o mover correctamente el serial antes "
                    "de asignarlo a otra ubicación."
                ) % (
                    quant.lot_id.name,
                    quant.product_id.display_name,
                    quant.location_id.display_name,
                    locations,
                ))
