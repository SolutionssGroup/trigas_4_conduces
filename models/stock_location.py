
from odoo import fields, models


class StockLocation(models.Model):
    _inherit = 'stock.location'

    is_trigas_truck_location = fields.Boolean(
        string='Ubicación camión Trigas',
        help='Marcar esta opción para permitir que esta ubicación sea usada como destino de camión en el flujo Trigas.'
    )
