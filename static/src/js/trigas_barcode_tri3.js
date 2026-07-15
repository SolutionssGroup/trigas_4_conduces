/** @odoo-module **/

/*
 * TRIGAS - TRI3 Recogida de Cilindros
 * Este archivo contendra unicamente la logica del flujo /TRI3/.
 * Fase A: extraccion en curso. Paso 4 - funciones de negocio/RPC
 * de destino de camion y serial de origen libre.
 */

import { _t } from '@web/core/l10n/translation';

window.TrigasBarcodeTri3 = window.TrigasBarcodeTri3 || {};

function tri3ScheduleTruckDestinationBadge(model) {
    if (model.__trigasTri3TruckDestinationBadgeTimer) {
        clearTimeout(model.__trigasTri3TruckDestinationBadgeTimer);
    }

    model.__trigasTri3TruckDestinationBadgeTimer = setTimeout(() => {
        tri3RenderTruckDestinationBadge(model);
    }, 250);

    setTimeout(() => {
        tri3RenderTruckDestinationBadge(model);
    }, 900);
}

async function tri3RenderTruckDestinationBadge(model, forcedLocationName) {
    const root = document.querySelector('.o_barcode_client_action');
    if (!root) {
        return;
    }

    const existing = root.querySelector('.trigas-tri3-truck-destination-badge');

    if (!model._trigasIsTri3NativeScreen || !model._trigasIsTri3NativeScreen()) {
        if (existing) {
            existing.remove();
        }
        return;
    }

    let locationName = forcedLocationName || model.__trigasTri3TruckDestinationName || '';

    if (!locationName) {
        const pickingId = model._trigasGetCurrentPickingIdForPda();
        if (pickingId) {
            try {
                const state = await model.orm.call(
                    'stock.picking',
                    'trigas_barcode_get_step_3_state',
                    [[pickingId]]
                );

                if (state && state.has_truck && state.truck_location_name) {
                    locationName = state.truck_location_name;
                    model.__trigasTri3TruckDestinationName = locationName;
                }
            } catch (error) {
                console.log('TRIGAS: no se pudo consultar destino TRI3', error);
            }
        }
    }

    if (!locationName) {
        if (existing) {
            existing.remove();
        }
        return;
    }

    const safeLocationName = String(locationName)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    let box = existing;
    if (!box) {
        box = document.createElement('div');
        box.className = 'trigas-tri3-truck-destination-badge';

        const reference =
            root.querySelector('.o_barcode_lines') ||
            root.querySelector('.o_barcode_line');

        if (reference && reference.parentNode) {
            reference.parentNode.insertBefore(box, reference);
        } else {
            root.insertBefore(box, root.firstChild);
        }
    }

    box.innerHTML = `
        <div style="font-weight:700;font-size:13px;margin-bottom:2px;">
            ✅ Destino camión leído
        </div>
        <div style="font-size:14px;font-weight:600;">
            ${safeLocationName}
        </div>
    `;

    box.style.margin = '8px 10px';
    box.style.padding = '10px 12px';
    box.style.background = '#eaf7ee';
    box.style.border = '1px solid #b7e2c1';
    box.style.borderLeft = '5px solid #28a745';
    box.style.borderRadius = '6px';
    box.style.color = '#1f5130';
    box.style.boxShadow = '0 1px 4px rgba(0,0,0,0.12)';
    box.style.position = 'sticky';
    box.style.top = '0';
    box.style.zIndex = '20';
}

async function tri3TryProcessTruckDestinationFromBarcode(model, barcode, parsedBarcodeData) {
    if (!model._trigasIsTri3NativeScreen || !model._trigasIsTri3NativeScreen()) {
        return false;
    }

    const scannedLocation = window.TrigasBarcodeCommon.getScannedLocationSafe(parsedBarcodeData);

    if (scannedLocation) {
        return await tri3ProcessTruckDestination(model, parsedBarcodeData);
    }

    const rawCode = String(barcode || '').trim();

    if (!rawCode) {
        return false;
    }

    // Solo intentamos con códigos que parecen ubicaciones de camión conocidas.
    // Esto evita interferir con seriales CILI-*.
    if (/^CILI[-_ ]?\d+/i.test(rawCode)) {
        return false;
    }

    const lower = rawCode.toLowerCase();

    if (
        lower.startsWith('cam') ||
        lower.includes('camion') ||
        lower.includes('camión') ||
        lower.includes('wh/stock/camion') ||
        lower.includes('wh/stock/camión')
    ) {
        return await tri3ProcessTruckDestination(model, rawCode);
    }

    return false;
}

async function tri3ProcessTruckDestination(model, barcodeData) {
    const scannedLocation = window.TrigasBarcodeCommon.getScannedLocationSafe(barcodeData);

    const locationCode = (
        (typeof barcodeData === 'string' && barcodeData) ||
        (scannedLocation && (
            scannedLocation.barcode ||
            scannedLocation.name ||
            scannedLocation.display_name ||
            scannedLocation.complete_name
        ))
    );

    if (!locationCode) {
        return false;
    }

    try {
        const result = await model.orm.call(
            'stock.picking',
            'trigas_tri3_set_truck_destination_from_barcode',
            [[model.params.id], locationCode]
        );

        if (!result || !result.ok) {
            model.notification.add(
                result && result.message ? result.message : _t('No se pudo registrar la ubicación destino.'),
                { type: 'danger' }
            );
            return true;
        }

        // TRI3/PDA: no mostrar toast verde de ubicación destino.
        // El comprobante visual fijo queda en pantalla.

        // PDA: no recargar la página completa.
        // Solo refrescar estado interno para que Odoo pinte nativo.
        try {
            await model._trigasReloadPickingState();
        } catch (e) {}

        model.__trigasTri3TruckDestinationName = result.location_name || result.locationName || '';
        tri3RenderTruckDestinationBadge(model, model.__trigasTri3TruckDestinationName);

        model.trigger('refresh');
        model.trigger('update');
        model._trigasAfterBarcodeUiUpdate();

        return true;

    } catch (error) {
        model.notification.add(
            window.TrigasBarcodeCommon.getErrorMessageSafe(
                error,
                _t('No se pudo registrar el camión destino.')
            ),
            { type: 'danger' }
        );
        return true;
    }
}

async function tri3ProcessAnyOriginSerial(model, barcodeData) {
    const serialName = (
        barcodeData &&
        barcodeData.lot &&
        (
            barcodeData.lot.name ||
            barcodeData.lot.display_name ||
            barcodeData.lot.barcode
        )
    );

    if (!serialName) {
        return false;
    }

    try {
        const result = await model.orm.call(
            'stock.picking',
            'trigas_tri3_add_serial_from_any_origin',
            [[model.params.id], serialName]
        );

        if (!result || !result.ok) {
            model.notification.add(
                result && result.message ? result.message : _t('No se pudo agregar el serial.'),
                { type: 'danger' }
            );
            return false;
        }

        // PDA: no mostrar toast verde por serial leído.
        // La confirmación visual queda en la línea/lista de la pantalla.

        // Importante PDA:
        // No usamos window.location.reload().
        // Solo pedimos al modelo Barcode que refresque su estado interno
        // y dejamos que Odoo pinte las líneas nativas.
        try {
            await model._trigasReloadPickingState();
        } catch (e) {
            // Si no aplica, usamos eventos nativos del modelo.
        }

        model.trigger('refresh');
        model.trigger('update');
        model._trigasAfterBarcodeUiUpdate();

        return false;

    } catch (error) {
        model.notification.add(
            window.TrigasBarcodeCommon.getErrorMessageSafe(
                error,
                _t('No se pudo agregar el serial desde su ubicación real.')
            ),
            { type: 'danger' }
        );
        return false;
    }
}

window.TrigasBarcodeTri3.scheduleTruckDestinationBadge = tri3ScheduleTruckDestinationBadge;
window.TrigasBarcodeTri3.renderTruckDestinationBadge = tri3RenderTruckDestinationBadge;
window.TrigasBarcodeTri3.tryProcessTruckDestinationFromBarcode = tri3TryProcessTruckDestinationFromBarcode;
window.TrigasBarcodeTri3.processTruckDestination = tri3ProcessTruckDestination;
window.TrigasBarcodeTri3.processAnyOriginSerial = tri3ProcessAnyOriginSerial;
