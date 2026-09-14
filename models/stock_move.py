from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


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

    # TRIGAS FIX 6: se detectaron ordenes (S08808, S08837, S08859, S08861)
    # donde una linea de cilindro quedaba con qty_done > 0 pero SIN serial
    # asignado (lot_id vacio). Eso hace que la pantalla de la PDA muestre la
    # cantidad como "completa" (cuenta la linea sin distinguir si tiene
    # serial real), mientras que la validacion del Conduce 1
    # (_trigas_prepare_step_1_before_validate) solo cuenta las lineas CON
    # serial real y correctamente rechaza validar por "cantidad no
    # coincide" - dejando al operador confundido: ve todo completo en
    # pantalla pero el sistema no lo deja avanzar.
    #
    # No se pudo aislar con certeza el camino exacto (PDA propia, app
    # nativa de Barcode de Odoo, o edicion manual) que crea esa linea sin
    # serial, asi que en vez de perseguir cada punto de entrada posible,
    # se bloquea aqui, a nivel de modelo: ninguna linea de un producto
    # cilindro Trigas puede guardarse con cantidad hecha pero sin serial,
    # sin importar por donde se intente crear o modificar. Esto convierte
    # el problema en un error inmediato y claro en el momento del escaneo
    # (o de la edicion), en vez de una orden atascada dias despues sin que
    # nadie entienda por que.
    @api.constrains('lot_id', 'qty_done', 'product_id')
    def _check_trigas_cylinder_done_qty_requires_serial(self):
        for line in self:
            if (
                line.qty_done > 0
                and not line.lot_id
                and line.product_id.tracking == 'serial'
                and line.product_id.product_tmpl_id.is_cylinder_conduce
            ):
                raise ValidationError(_(
                    'No se puede registrar cantidad para "%s" sin un número de serie. '
                    'Escanea el serial del cilindro antes de continuar (Conduce: %s).'
                ) % (
                    line.product_id.display_name,
                    line.picking_id.display_name or '',
                ))
