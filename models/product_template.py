from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    is_cylinder_conduce = fields.Boolean(
        string='Usar flujo Trigas de 4 conduces',
        default=False,
        copy=False
    )

    def _trigas_check_cylinder_not_rentable(self):
        # rent_ok solo existe si el módulo de Alquiler (sale_renting o
        # equivalente) está instalado. No se declara como dependencia de
        # trigas_4_conduces a propósito: el negocio decidió dejar de usar
        # Alquiler para los cilindros Trigas, y no queremos que este módulo
        # dependa formalmente de uno que se planea dejar de usar (o
        # eventualmente desinstalar). Por eso el chequeo se hace en tiempo de
        # ejecución sobre self._fields, y no con @api.constrains referenciando
        # 'rent_ok' directamente en el decorador.
        if 'rent_ok' not in self._fields:
            return
        for product in self:
            if product.is_cylinder_conduce and product.rent_ok:
                raise ValidationError(_(
                    'El producto "%s" usa el flujo Trigas de 4 conduces y no puede '
                    'tener activo "Se puede Alquilar" al mismo tiempo. El control de '
                    'préstamo/devolución del cilindro ya lo hace el conduce (Trigas); '
                    'activar Alquiler sobre este mismo producto desconecta la entrega '
                    'real del cilindro de lo que el sistema registra. Si se necesita '
                    'cobrar una tarifa fija por el cilindro, debe hacerse con una línea '
                    'o producto de servicio aparte, no marcando este producto físico '
                    'como alquilable.'
                ) % product.display_name)

    @api.model_create_multi
    def create(self, vals_list):
        products = super().create(vals_list)
        products._trigas_check_cylinder_not_rentable()
        return products

    def write(self, vals):
        res = super().write(vals)
        if 'rent_ok' in vals or 'is_cylinder_conduce' in vals:
            self._trigas_check_cylinder_not_rentable()
        return res
