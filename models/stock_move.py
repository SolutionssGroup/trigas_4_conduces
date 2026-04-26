from odoo import fields, models


class StockMove(models.Model):
    _inherit = 'stock.move'

    trigas_sale_order_id = fields.Many2one(
        'sale.order',
        string='Orden de venta Trigas',
        related='picking_id.sale_order_id',
        store=True,
        readonly=True
    )

    trigas_sale_order_name = fields.Char(
        string='Orden de venta',
        related='picking_id.sale_order_id.name',
        store=True,
        readonly=True
    )


class StockMoveLine(models.Model):
    _inherit = 'stock.move.line'

    trigas_sale_order_id = fields.Many2one(
        'sale.order',
        string='Orden de venta Trigas',
        related='picking_id.sale_order_id',
        store=True,
        readonly=True
    )

    trigas_sale_order_name = fields.Char(
        string='Orden de venta',
        related='picking_id.sale_order_id.name',
        store=True,
        readonly=True
    )
