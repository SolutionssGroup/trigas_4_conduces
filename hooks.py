from odoo import api, SUPERUSER_ID


def post_init_hook(cr, registry):
    env = api.Environment(cr, SUPERUSER_ID, {})
    partners = env['res.partner'].search([
        ('parent_id', '=', False),
        '|', ('type', '=', False), ('type', '=', 'contact'),
        ('trigas_customer_location_id', '=', False),
    ])
    partners._trigas_ensure_customer_location()