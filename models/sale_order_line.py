from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class SaleOrderLine(models.Model):
    _inherit = 'sale.order.line'

    trigas_is_cylinder_conduce_product = fields.Boolean(
        string='Es cilindro Trigas',
        related='product_id.product_tmpl_id.is_cylinder_conduce',
        readonly=True,
    )

    trigas_definitive_sale = fields.Boolean(
        string='Venta definitiva (no retorna)',
        copy=False,
        help=(
            'El cliente se queda con este cilindro para siempre: no se '
            'espera Conduce 3 (recogida) de estos seriales. El movimiento '
            'de inventario del Conduce 2 no cambia (ya sale del stock de '
            'la empresa igual que un préstamo), pero como la categoría del '
            'producto no contabiliza costo automático, contabilidad debe '
            'registrar un asiento manual por el costo de estos cilindros. '
            'Ver acción "Ventas definitivas de cilindros" para el listado '
            'de pendientes.'
        ),
    )

    trigas_definitive_sale_cost_booked = fields.Boolean(
        string='Costo contabilizado',
        copy=False,
        help='Marcar cuando contabilidad ya registró el asiento manual del costo de este cilindro vendido.',
    )

    trigas_definitive_sale_cost_pending = fields.Boolean(
        string='Costo pendiente de contabilizar',
        compute='_compute_trigas_definitive_sale_cost_pending',
        store=True,
    )

    @api.depends(
        'trigas_definitive_sale',
        'trigas_definitive_sale_cost_booked',
        'qty_delivered',
    )
    def _compute_trigas_definitive_sale_cost_pending(self):
        for line in self:
            line.trigas_definitive_sale_cost_pending = bool(
                line.trigas_definitive_sale
                and line.qty_delivered > 0
                and not line.trigas_definitive_sale_cost_booked
            )

    @api.constrains('trigas_definitive_sale')
    def _check_trigas_definitive_sale_only_on_cylinder(self):
        for line in self:
            if line.trigas_definitive_sale and not line.trigas_is_cylinder_conduce_product:
                raise ValidationError(_(
                    '"Venta definitiva" solo aplica a líneas de productos con el flujo '
                    'Trigas de 4 conduces activado. La línea "%s" no es uno de esos '
                    'productos.'
                ) % (line.name or line.product_id.display_name))

    def _compute_qty_delivered_method(self):
        """Los productos cilindro (is_cylinder_conduce) se entregan por el
        flujo de conduce por camion, no por el movimiento estandar de Odoo
        (que se cancela a proposito, ver
        SaleOrder._trigas_cancel_standard_delivery_pickings). Si se deja el
        metodo por defecto 'stock_move', Odoo vuelve a calcular
        qty_delivered a partir de ese movimiento cancelado y siempre da 0,
        borrando lo que StockPicking._trigas_sync_qty_delivered_to_sale_order
        haya escrito. Con 'manual', Odoo respeta el valor que nosotros
        escribimos ahi y no lo recalcula solo.
        """
        super()._compute_qty_delivered_method()
        for line in self:
            if line.product_id and line.product_id.product_tmpl_id.is_cylinder_conduce:
                line.qty_delivered_method = 'manual'
