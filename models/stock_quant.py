import logging

from odoo import SUPERUSER_ID, api, models, _
from odoo.exceptions import ValidationError

_logger = logging.getLogger(__name__)


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

    def _trigas_force_correct_serial_location(self, product, lot, correct_location):
        """
        Fuerza que el serial (product, lot) quede con existencia positiva
        UNICAMENTE en correct_location. Cualquier otro quant positivo del
        mismo serial en otra ubicacion (de Trigas o de cualquier otro
        modulo) se limpia mediante un ajuste de inventario auditable.
        """
        Quant = self.env['stock.quant'].with_user(SUPERUSER_ID)

        # Solo consideramos "extraviados" los quants en ubicaciones reales
        # (almacen, cliente, transito). Ubicaciones virtuales (ej. ajustes de
        # inventario) generan contrapartidas contables normales que NO deben
        # tocarse, o se duplicaria la cantidad real al forzar su correccion.
        stray_quants = Quant.search([
            ('product_id', '=', product.id),
            ('lot_id', '=', lot.id),
            ('quantity', '!=', 0),
            ('location_id', '!=', correct_location.id),
            ('location_id.usage', 'in', ['internal', 'customer', 'transit']),
        ])

        for stray in stray_quants:
            risky_lines = self.env['stock.move.line'].sudo().search([
                ('lot_id', '=', lot.id),
                ('product_id', '=', product.id),
                ('location_id', '=', stray.location_id.id),
                ('state', 'not in', ('done', 'cancel')),
                ('reserved_uom_qty', '>', 0),
            ])
            if risky_lines:
                _logger.warning(
                    "TRIGAS auto-correccion: limpiando quant serial=%s "
                    "ubicacion=%s (qty=%s) tenia %s linea(s) reservada(s) de "
                    "otra(s) operacion(es) (pickings: %s) que Odoo puede "
                    "desreservar o eliminar automaticamente.",
                    lot.name, stray.location_id.display_name, stray.quantity,
                    len(risky_lines), risky_lines.mapped('picking_id.name'),
                )

            stray_ctx = stray.with_context(inventory_mode=True)
            stray_ctx.inventory_quantity = 0
            stray_ctx._apply_inventory()

        correct_quant = Quant.search([
            ('product_id', '=', product.id),
            ('lot_id', '=', lot.id),
            ('location_id', '=', correct_location.id),
        ], limit=1)

        if not correct_quant:
            correct_quant = Quant.create({
                'product_id': product.id,
                'lot_id': lot.id,
                'location_id': correct_location.id,
            })

        if correct_quant.quantity <= 0:
            correct_ctx = correct_quant.with_context(inventory_mode=True)
            correct_ctx.inventory_quantity = 1
            correct_ctx._apply_inventory()

        return True
