from odoo import models


class SaleOrderLine(models.Model):
    _inherit = 'sale.order.line'

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
