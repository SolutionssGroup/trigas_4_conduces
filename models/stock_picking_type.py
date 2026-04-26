from odoo import models


class StockPickingType(models.Model):
    _inherit = 'stock.picking.type'

    def get_action_picking_tree_ready_kanban(self):
        self.ensure_one()

        action = super().get_action_picking_tree_ready_kanban()

        if self.sequence_code == 'TRI1':
            action['domain'] = [
                ('is_trigas_conduce', '=', True),
                ('trigas_step', '=', '1'),
                ('state', 'not in', ['done', 'cancel']),
            ]
            action['context'] = {
                'default_picking_type_id': self.id,
            }

        elif self.sequence_code == 'TRI2':
            action['domain'] = [
                ('is_trigas_conduce', '=', True),
                ('trigas_step', '=', '2'),
                ('state', 'not in', ['done', 'cancel']),
            ]
            action['context'] = {
                'default_picking_type_id': self.id,
            }

        return action
