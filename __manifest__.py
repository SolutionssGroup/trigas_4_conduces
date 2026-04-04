{
    'name': 'Trigas Conduces',
    'version': '16.0.1.0.0',
    'summary': 'Flujo de conduces para cilindros Trigas',
    'description': 'Genera automáticamente los conduces de entrega para productos cilindro.',
    'author': 'Solutions Group',
    'license': 'LGPL-3',
    'category': 'Inventory',
    'depends': [
        'sale_management',
        'stock',
        'stock_barcode',
        'mail',
    ],
    'data': [
        'data/stock_picking_type_data.xml',
        'data/mail_template_data.xml',
        'views/product_views.xml',
        'views/res_partner_views.xml',
        'views/sale_order_views.xml',
        'views/stock_picking_views.xml',
        'wizard/trigas_delivery_signature_wizard_view.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'trigas_4_conduces/static/src/js/trigas_barcode_picking_patch.js',
        ],
    },
    'post_init_hook': 'post_init_hook',
    'installable': True,
    'application': False,
}