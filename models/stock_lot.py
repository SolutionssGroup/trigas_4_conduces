from odoo import api, models, _
from odoo.exceptions import ValidationError


class StockLot(models.Model):
    _inherit = 'stock.lot'

    @api.constrains('name', 'product_id', 'company_id')
    def _check_trigas_unique_serial_by_company(self):
        """
        Regla Trigas:
        Si el producto usa trazabilidad por número de serie,
        el número de serie debe ser único dentro de la compañía.

        Odoo estándar permite repetir el mismo serial en productos diferentes,
        pero para el control unitario de Trigas eso no debe permitirse.
        """
        for lot in self:
            serial = (lot.name or '').strip()

            if not serial:
                continue

            if serial.startswith('DUPLICADO_REMOVIDO_'):
                continue

            if lot.product_id.tracking != 'serial':
                continue

            domain = [
                ('id', '!=', lot.id),
                ('name', '=', serial),
                ('product_id.tracking', '=', 'serial'),
                ('name', 'not ilike', 'DUPLICADO_REMOVIDO_%'),
            ]

            if lot.company_id:
                domain.append(('company_id', '=', lot.company_id.id))
            else:
                domain.append(('company_id', '=', False))

            duplicate = self.search(domain, limit=1)

            if duplicate:
                raise ValidationError(_(
                    "No se puede crear o modificar este número de serie.\n\n"
                    "El serial '%s' ya existe en otro producto con trazabilidad por serie.\n\n"
                    "Serial existente:\n"
                    "- Lot ID: %s\n"
                    "- Producto: %s\n"
                    "- Compañía: %s\n\n"
                    "Regla Trigas:\n"
                    "Si el producto usa trazabilidad por número de serie, "
                    "el número de serie debe ser único dentro de la compañía."
                ) % (
                    serial,
                    duplicate.id,
                    duplicate.product_id.display_name,
                    duplicate.company_id.display_name if duplicate.company_id else "Sin compañía",
                ))
