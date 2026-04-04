from odoo import fields, models


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    is_cylinder_conduce = fields.Boolean(
        string='Usar flujo Trigas de 4 conduces',
        default=False,
        copy=False
    )