from odoo import fields, models


class TrigasChofer(models.Model):
    _name = 'x_choferes'
    _description = 'Choferes'
    _rec_name = 'x_name'

    x_name = fields.Char(
        string='Nombre',
        required=True
    )

    active = fields.Boolean(
        string='Activo',
        default=True
    )
