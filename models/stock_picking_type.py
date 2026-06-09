# -*- coding: utf-8 -*-
from odoo import models, _


class StockPickingType(models.Model):
    _inherit = 'stock.picking.type'

    def _trigas_is_xmlid(self, xmlid):
        self.ensure_one()
        record = self.env.ref(xmlid, raise_if_not_found=False)
        return bool(record and record._name == 'stock.picking.type' and record.id == self.id)

    def _trigas_is_tri1_type(self):
        self.ensure_one()
        return self._trigas_is_xmlid('trigas_4_conduces.picking_type_trigas_step_1') or (self.sequence_code or '').upper() == 'TRI1'

    def _trigas_is_tri2_type(self):
        self.ensure_one()
        return self._trigas_is_xmlid('trigas_4_conduces.picking_type_trigas_step_2') or (self.sequence_code or '').upper() == 'TRI2'

    def _trigas_is_tri3_type(self):
        self.ensure_one()
        return self._trigas_is_xmlid('trigas_4_conduces.picking_type_trigas_step_3') or (self.sequence_code or '').upper() == 'TRI3'

    def _trigas_is_standard_internal_type(self):
        self.ensure_one()

        # No confundir los conduces Trigas con la operación normal de Transferencias Internas.
        if self._trigas_is_tri1_type() or self._trigas_is_tri2_type() or self._trigas_is_tri3_type():
            return False

        # Tipo interno principal nativo de Odoo.
        if self._trigas_is_xmlid('stock.picking_type_internal'):
            return True

        # Fallback por si en alguna base el XMLID cambia o hay otro almacén interno estándar.
        return self.code == 'internal' and (self.sequence_code or '').upper() == 'INT'

    def _trigas_should_auto_create_empty_barcode_picking(self):
        self.ensure_one()

        # Solo estas dos operaciones pueden crear picking automáticamente si no hay pendientes.
        return self._trigas_is_standard_internal_type() or self._trigas_is_tri3_type()

    def _trigas_create_empty_barcode_picking(self):
        self.ensure_one()

        picking = self.env['stock.picking']._create_new_picking(self)

        vals = {
            'origin': _('Creado desde PDA'),
        }

        if self._trigas_is_tri3_type():
            vals.update({
                'is_trigas_conduce': True,
                'trigas_step': '3',
                'origin': _('Recogida PDA'),
            })

        picking.write(vals)
        return picking

    def _trigas_cleanup_empty_pda_drafts(self):
        self.ensure_one()

        domain = [
            ('picking_type_id', '=', self.id),
            ('state', '=', 'draft'),
        ]

        # Para Recogida de Cilindros solo limpiamos borradores creados por este flujo PDA.
        if self._trigas_is_tri3_type():
            domain.append(('origin', 'in', ['Recogida PDA', 'Creado desde PDA']))

        # Para Transferencias Internas, Odoo puede dejar borradores vacíos con origin False
        # cuando se abre/cierra Nuevo sin escanear. Si no tienen movimientos ni líneas,
        # no son operaciones reales y bloquean la creación automática.
        empty_drafts = self.env['stock.picking'].search(domain)
        empty_drafts = empty_drafts.filtered(lambda p: not p.move_ids and not p.move_line_ids)

        if empty_drafts:
            empty_drafts.unlink()

    def get_action_picking_tree_ready_kanban(self):
        self.ensure_one()

        # TRI1 / Entrega a Camión y TRI2 / Entrega a Cliente:
        # siempre deben abrir lista de pickings. Nunca crear automático.
        if self._trigas_is_tri1_type() or self._trigas_is_tri2_type():
            return super().get_action_picking_tree_ready_kanban()

        # Transferencias Internas y TRI3:
        # si no hay pendientes, crear picking vacío y abrir Barcode directo.
        if self._trigas_should_auto_create_empty_barcode_picking():
            self._trigas_cleanup_empty_pda_drafts()

            pending = self.env['stock.picking'].search_count([
                ('picking_type_id', '=', self.id),
                ('state', 'not in', ['done', 'cancel']),
            ])

            if pending == 0:
                picking = self._trigas_create_empty_barcode_picking()
                return picking.action_open_picking_client_action()

            # Si hay pickings activos, deben verse en la lista.
            # En Transferencias Internas, Barcode trae search_default_available=1
            # y eso oculta pickings en draft aunque tengan líneas.
            action = super().get_action_picking_tree_ready_kanban()

            if self._trigas_is_standard_internal_type() and isinstance(action, dict):
                ctx = dict(action.get('context') or {})
                ctx.pop('search_default_available', None)
                ctx['search_default_to_do_transfers'] = 1
                ctx['search_default_picking_type_id'] = [self.id]
                ctx['default_picking_type_id'] = self.id
                action['context'] = ctx

            return action

        return super().get_action_picking_tree_ready_kanban()
