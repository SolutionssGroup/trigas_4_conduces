from odoo import api, fields, models, _


class ResPartner(models.Model):
    _inherit = 'res.partner'

    trigas_customer_location_id = fields.Many2one(
        'stock.location',
        string='Ubicación Trigas del cliente',
        copy=False,
        readonly=True
    )

    trigas_customer_location_barcode = fields.Char(
        string='Barcode ubicación Trigas',
        related='trigas_customer_location_id.barcode',
        readonly=True
    )

    def _trigas_needs_customer_location(self):
        self.ensure_one()
        return not self.parent_id and (not self.type or self.type == 'contact')

    def _trigas_get_customer_parent_location(self):
        location_model = self.env['stock.location'].sudo()
        root_location = self.env.ref('stock.stock_location_locations')

        parent_location = location_model.search([
            ('name', '=', 'CLIENTES_TRIGAS'),
            ('location_id', '=', root_location.id),
            ('usage', '=', 'view'),
        ], limit=1)

        if not parent_location:
            parent_location = location_model.create({
                'name': 'CLIENTES_TRIGAS',
                'usage': 'view',
                'location_id': root_location.id,
                'company_id': self.env.company.id,
            })

        return parent_location

    def _trigas_build_customer_location_name(self):
        self.ensure_one()
        base_name = self.name or _('Cliente sin nombre')
        return f'CLI{self.id:05d} - {base_name}'

    def _trigas_build_customer_location_barcode(self):
        self.ensure_one()
        return f'TRGCLI{self.id:05d}'

    def _trigas_create_customer_location(self):
        self.ensure_one()

        if self.trigas_customer_location_id or not self._trigas_needs_customer_location():
            return self.trigas_customer_location_id

        location_model = self.env['stock.location'].sudo()
        parent_location = self._trigas_get_customer_parent_location()

        barcode = self._trigas_build_customer_location_barcode()

        existing_location = location_model.search([
            ('barcode', '=', barcode),
        ], limit=1)

        if existing_location:
            self.sudo().write({
                'trigas_customer_location_id': existing_location.id,
            })
            return existing_location

        new_location = location_model.create({
            'name': self._trigas_build_customer_location_name(),
            'usage': 'customer',
            'location_id': parent_location.id,
            'barcode': barcode,
            'company_id': self.env.company.id,
        })

        self.sudo().write({
            'trigas_customer_location_id': new_location.id,
        })
        return new_location

    def _trigas_ensure_customer_location(self):
        for partner in self:
            if partner._trigas_needs_customer_location() and not partner.trigas_customer_location_id:
                partner._trigas_create_customer_location()

    @api.model_create_multi
    def create(self, vals_list):
        partners = super().create(vals_list)
        partners._trigas_ensure_customer_location()
        return partners

    def write(self, vals):
        res = super().write(vals)
        self._trigas_ensure_customer_location()
        return res