/** @odoo-module **/

console.log('TRIGAS ARCHIVO JS CARGADO');

import BarcodeModel from '@stock_barcode/models/barcode_model';
import BarcodePickingModel from '@stock_barcode/models/barcode_picking_model';
import LineComponent from '@stock_barcode/components/line';
import GroupedLineComponent from '@stock_barcode/components/grouped_line';
import { patch } from '@web/core/utils/patch';
import { _t } from '@web/core/l10n/translation';

const originalAskBeforeAddProduct = BarcodePickingModel.prototype._askBeforeAddProduct;
const originalLoadData = BarcodePickingModel.prototype._loadData;
const originalLoad = BarcodePickingModel.prototype.load;
const originalRefresh = BarcodePickingModel.prototype.refresh;

// Limpieza global del botón de firma Trigas.
// Odoo Barcode cambia de pantalla sin recargar la página completa,
// por eso el botón flotante puede quedarse pegado si no se elimina manualmente.
function trigasRemoveFloatingSignatureElements() {
    const buttonWrapper = document.getElementById('trigas_barcode_signature_button_wrapper');
    const modalWrapper = document.getElementById('trigas_signature_modal_wrapper');

    if (buttonWrapper) {
        buttonWrapper.remove();
    }

    if (modalWrapper) {
        modalWrapper.remove();
    }
}

function trigasIsBarcodeListScreen() {
    const bodyText = (document.body && document.body.innerText) ? document.body.innerText : '';

    return Boolean(
        bodyText.includes('NUEVO') &&
        (
            bodyText.includes('Orden:') ||
            bodyText.includes('Conduce:') ||
            bodyText.includes('A PROCESAR') ||
            bodyText.includes('Camión a cliente') ||
            bodyText.includes('Entrega camión')
        )
    );
}

function trigasStartSignatureButtonWatchdog() {
    if (window.__trigasSignatureButtonWatchdogStarted) {
        return;
    }

    window.__trigasSignatureButtonWatchdogStarted = true;

    setInterval(() => {
        if (trigasIsBarcodeListScreen()) {
            trigasRemoveFloatingSignatureElements();
        }
    }, 500);
}

trigasStartSignatureButtonWatchdog();

function trigasCleanBarcodeDataSafe(barcodeData) {
    if (!barcodeData) {
        return;
    }
    delete barcodeData.product;
    delete barcodeData.lot;
    delete barcodeData.lotName;
    delete barcodeData.package;
    delete barcodeData.packageType;
    delete barcodeData.packageName;
    delete barcodeData.packaging;
    delete barcodeData.quantity;
    delete barcodeData.weight;
}

function trigasGetLocationDisplayNameSafe(location) {
    return (
        location?.display_name ||
        location?.name ||
        location?.complete_name ||
        'Ubicación'
    );
}

function trigasGetErrorMessageSafe(error, fallbackMessage) {
    return (
        error?.data?.message ||
        error?.data?.arguments?.[0] ||
        error?.message ||
        fallbackMessage
    );
}

function trigasIsInternalLocationSafe(location) {
    return !!(location && location.usage === 'internal');
}

function trigasGetScannedLocationSafe(barcodeData) {
    if (!barcodeData) {
        return false;
    }
    return barcodeData.destLocation || barcodeData.location || false;
}

function trigasGetStepFromRecordSafe(model) {
    const record = model?.record || {};

    if (record.trigas_step === '1') {
        return '1';
    }

    if (record.trigas_step === '2') {
        return '2';
    }

    const note = (record.note || '').toString();
    const origin = (record.origin || '').toString();

    if (note.includes('Flujo Trigas paso 1') || origin.includes('Conduce 1')) {
        return '1';
    }

    if (note.includes('Flujo Trigas paso 2') || origin.includes('Conduce 2')) {
        return '2';
    }

    return false;
}

// Fallback global Trigas:
// Evita error si alguna instancia del Barcode no recibe el método desde patch().
if (!BarcodePickingModel.prototype._trigasGetStepFromRecord) {
    BarcodePickingModel.prototype._trigasGetStepFromRecord = function () {
        const record = this.record || {};

        if (record.trigas_step === '1') {
            return '1';
        }

        if (record.trigas_step === '2') {
            return '2';
        }

        const note = (record.note || '').toString();
        const origin = (record.origin || '').toString();

        if (note.includes('Flujo Trigas paso 1') || origin.includes('Conduce 1')) {
            return '1';
        }

        if (note.includes('Flujo Trigas paso 2') || origin.includes('Conduce 2')) {
            return '2';
        }

        return false;
    };
}

patch(BarcodePickingModel.prototype, 'trigas_4_conduces.BarcodePickingModel', {

    async _loadData(...args) {
        const result = originalLoadData ? await originalLoadData.apply(this, args) : undefined;
        this._trigasAfterBarcodeUiUpdate();
        return result;
    },

    async load(...args) {
        const result = originalLoad ? await originalLoad.apply(this, args) : undefined;
        this._trigasAfterBarcodeUiUpdate();
        return result;
    },

    async refresh(...args) {
        const result = originalRefresh ? await originalRefresh.apply(this, args) : undefined;
        this._trigasAfterBarcodeUiUpdate();
        return result;
    },

    _trigasAfterBarcodeUiUpdate() {
        window.__trigasBarcodePickingModel = this;

        // Si el usuario volvió al listado o cambió de pantalla,
        // eliminar inmediatamente cualquier botón flotante que haya quedado.
        if (typeof this._trigasIsInsideBarcodePickingDetail === 'function' && !this._trigasIsInsideBarcodePickingDetail()) {
            this._trigasRemoveSignatureButton();
            this._trigasRemoveSignatureModal();
            return;
        }

        this._trigasScheduleSignatureButtonUpdate();
    },

    _trigasGetActionService() {
        return (
            this.action ||
            this.actionService ||
            this.env?.services?.action ||
            false
        );
    },

    _trigasRemoveSignatureButton() {
        const existing = document.getElementById('trigas_barcode_signature_button_wrapper');
        if (existing) {
            existing.remove();
        }
    },

    _trigasScheduleSignatureButtonUpdate() {
        if (this.__trigasSignatureButtonTimer) {
            clearTimeout(this.__trigasSignatureButtonTimer);
        }

        this.__trigasSignatureButtonTimer = setTimeout(() => {
            this._trigasRefreshSignatureButton();
        }, 250);
    },

    _trigasFrontendHasDoneLines() {
        const bodyText = (document.body && document.body.innerText) ? document.body.innerText : '';

        // Detecta líneas visuales como 3 / 3, 2 / 2, 1 / 1 en la PDA.
        const matches = bodyText.match(/(\d+)\s*\/\s*(\d+)/g) || [];
        for (const match of matches) {
            const parts = match.split('/').map((p) => Number(p.trim()));
            if (parts.length === 2 && parts[0] > 0 && parts[0] === parts[1]) {
                return true;
            }
        }

        if (this.currentState && Array.isArray(this.currentState.lines)) {
            for (const line of this.currentState.lines) {
                const qtyDone = Number(
                    line.qty_done ||
                    line.qtyDone ||
                    line.quantity ||
                    line.qty ||
                    line.done_qty ||
                    line.doneQuantity ||
                    0
                );

                if (qtyDone > 0) {
                    return true;
                }
            }
        }

        return false;
    },

    _trigasRemoveSignatureModal() {
        const existing = document.getElementById('trigas_signature_modal_wrapper');
        if (existing) {
            existing.remove();
        }
    },

    _trigasOpenSignatureModal() {
        this._trigasRemoveSignatureModal();

        const wrapper = document.createElement('div');
        wrapper.id = 'trigas_signature_modal_wrapper';
        wrapper.style.position = 'fixed';
        wrapper.style.left = '0';
        wrapper.style.right = '0';
        wrapper.style.top = '0';
        wrapper.style.bottom = '0';
        wrapper.style.zIndex = '100000';
        wrapper.style.background = 'rgba(0,0,0,0.45)';
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.justifyContent = 'center';
        wrapper.style.padding = '12px';

        const modal = document.createElement('div');
        modal.style.background = '#fff';
        modal.style.borderRadius = '10px';
        modal.style.width = '100%';
        modal.style.maxWidth = '420px';
        modal.style.padding = '14px';
        modal.style.boxShadow = '0 8px 30px rgba(0,0,0,0.35)';

        const title = document.createElement('div');
        title.textContent = _t('Firma de entrega');
        title.style.fontWeight = '800';
        title.style.fontSize = '16px';
        title.style.marginBottom = '10px';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = _t('Nombre de quien recibe');
        input.value = this.record?.partner_id?.display_name || this.record?.partner_id?.name || '';
        input.style.width = '100%';
        input.style.padding = '9px';
        input.style.marginBottom = '10px';
        input.style.border = '1px solid #ccc';
        input.style.borderRadius = '6px';

        const canvas = document.createElement('canvas');
        canvas.width = 360;
        canvas.height = 170;
        canvas.style.width = '100%';
        canvas.style.height = '170px';
        canvas.style.border = '1px solid #999';
        canvas.style.borderRadius = '6px';
        canvas.style.background = '#fff';
        canvas.style.touchAction = 'none';

        const ctx = canvas.getContext('2d');
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000';

        let drawing = false;
        let hasDrawn = false;

        const getPos = (event) => {
            const rect = canvas.getBoundingClientRect();
            const point = event.touches ? event.touches[0] : event;
            return {
                x: (point.clientX - rect.left) * (canvas.width / rect.width),
                y: (point.clientY - rect.top) * (canvas.height / rect.height),
            };
        };

        const start = (event) => {
            event.preventDefault();
            drawing = true;
            hasDrawn = true;
            const pos = getPos(event);
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
        };

        const move = (event) => {
            if (!drawing) {
                return;
            }
            event.preventDefault();
            const pos = getPos(event);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        };

        const end = (event) => {
            if (event) {
                event.preventDefault();
            }
            drawing = false;
        };

        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', move);
        canvas.addEventListener('mouseup', end);
        canvas.addEventListener('mouseleave', end);
        canvas.addEventListener('touchstart', start, { passive: false });
        canvas.addEventListener('touchmove', move, { passive: false });
        canvas.addEventListener('touchend', end, { passive: false });

        const buttons = document.createElement('div');
        buttons.style.display = 'flex';
        buttons.style.gap = '8px';
        buttons.style.marginTop = '12px';

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.textContent = _t('Limpiar');
        clearBtn.className = 'btn btn-secondary';
        clearBtn.style.flex = '1';
        clearBtn.onclick = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            hasDrawn = false;
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = _t('Cancelar');
        cancelBtn.className = 'btn btn-light';
        cancelBtn.style.flex = '1';
        cancelBtn.onclick = () => {
            this._trigasRemoveSignatureModal();
        };

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.textContent = _t('Guardar firma');
        saveBtn.className = 'btn btn-primary';
        saveBtn.style.flex = '1.4';
        saveBtn.onclick = async () => {
            const signedBy = (input.value || '').trim();

            if (!signedBy) {
                this.notification.add(_t('Debes indicar el nombre de quien recibe.'), { type: 'danger' });
                return;
            }

            if (!hasDrawn) {
                this.notification.add(_t('Debes realizar la firma antes de guardar.'), { type: 'danger' });
                return;
            }

            try {
                const signatureBase64 = canvas.toDataURL('image/png');
                await this.orm.call(
                    'stock.picking',
                    'trigas_barcode_save_delivery_signature',
                    [[this.params.id], signedBy, signatureBase64]
                );

                this.notification.add(_t('Firma registrada correctamente.'), { type: 'success' });
                this._trigasRemoveSignatureModal();
                this._trigasRemoveSignatureButton();
                await this._trigasReloadPickingState();
            } catch (error) {
                this.notification.add(
                    trigasGetErrorMessageSafe(error, _t('No se pudo guardar la firma.')),
                    { type: 'danger' }
                );
            }
        };

        buttons.appendChild(clearBtn);
        buttons.appendChild(cancelBtn);
        buttons.appendChild(saveBtn);

        modal.appendChild(title);
        modal.appendChild(input);
        modal.appendChild(canvas);
        modal.appendChild(buttons);
        wrapper.appendChild(modal);
        document.body.appendChild(wrapper);
    },

    async _trigasRefreshSignatureButton() {
        if (!this.params || !this.params.id) {
            this._trigasRemoveSignatureButton();
            return;
        }

        let info = false;

        try {
            info = await this.orm.call(
                'stock.picking',
                'trigas_barcode_get_signature_info',
                [[this.params.id]]
            );
        } catch (error) {
            this._trigasRemoveSignatureButton();
            return;
        }

        if (!info || !info.is_step_2) {
            this._trigasRemoveSignatureButton();
            return;
        }

        const frontendDone = this._trigasFrontendHasDoneLines();
        const readyToShow = Boolean(info.customer_location_ready && (info.has_done_cylinders || frontendDone));

        if (!readyToShow && !info.signed) {
            this._trigasRemoveSignatureButton();
            return;
        }

        let wrapper = document.getElementById('trigas_barcode_signature_button_wrapper');

        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.id = 'trigas_barcode_signature_button_wrapper';
            wrapper.style.position = 'fixed';
            wrapper.style.left = '24px';
            wrapper.style.right = '24px';
            wrapper.style.bottom = '82px';
            wrapper.style.zIndex = '99999';
            wrapper.style.display = 'flex';
            wrapper.style.justifyContent = 'center';
            wrapper.style.pointerEvents = 'none';

            const button = document.createElement('button');
            button.id = 'trigas_barcode_signature_button';
            button.type = 'button';
            button.className = 'btn btn-primary';
            button.style.width = '70%';
            button.style.maxWidth = '260px';
            button.style.padding = '7px 10px';
            button.style.fontWeight = '700';
            button.style.fontSize = '12px';
            button.style.borderRadius = '6px';
            button.style.pointerEvents = 'auto';

            wrapper.appendChild(button);
            document.body.appendChild(wrapper);
        }

        const button = document.getElementById('trigas_barcode_signature_button');

        if (info.signed) {
            this._trigasRemoveSignatureButton();
            return;
        }

        button.textContent = _t('Firmar entrega');
        button.disabled = false;
        button.className = 'btn btn-primary';

        button.onclick = () => {
            this._trigasOpenSignatureModal();
        };
    },

    async _trigasReloadPickingState() {
        if (typeof this._loadData === 'function') {
            await this._loadData(this.params);
            return;
        }
        if (typeof this.load === 'function') {
            await this.load();
            return;
        }
        if (typeof this.refresh === 'function') {
            await this.refresh();
            return;
        }
    },

    async _trigasApplySourceDisplayOverride(location) {
        const displayName = trigasGetLocationDisplayNameSafe(location);

        await this._trigasReloadPickingState();

        if (this.currentState && Array.isArray(this.currentState.lines)) {
            for (const line of this.currentState.lines) {
                line.trigas_override_source_display_name = displayName;

                if (line.location_id) {
                    line.location_id.display_name = displayName;
                    line.location_id.name = displayName;
                    line.location_id.complete_name = displayName;
                }
            }
        }

        this.trigger('update');
        this._trigasAfterBarcodeUiUpdate();
    },

    async _trigasApplyDisplayOverride(location, barcodeData) {
        const displayName = trigasGetLocationDisplayNameSafe(location);

        if (!this.lastScanned) {
            this.lastScanned = {};
        }

        this.lastScanned.trigas_scanned_location = location;
        this.lastScanned.trigas_scanned_location_display_name = displayName;

        trigasCleanBarcodeDataSafe(barcodeData);
        barcodeData.stopped = true;

        await this._trigasReloadPickingState();

        if (this.currentState && Array.isArray(this.currentState.lines)) {
            for (const line of this.currentState.lines) {
                line.trigas_override_dest_display_name = displayName;
                if (line.location_dest_id) {
                    line.location_dest_id.display_name = displayName;
                    line.location_dest_id.name = displayName;
                    line.location_dest_id.complete_name = displayName;
                }
            }
        }

        this.notification.add(
            _t('Ubicación registrada: ') + displayName,
            { type: 'success' }
        );

        this.trigger('update');
        this._trigasAfterBarcodeUiUpdate();
    },

    async _trigasRegisterTruckLocation(truckLocation, barcodeData) {
        try {
            await this.orm.call(
                'stock.picking',
                'trigas_barcode_register_truck_location',
                [[this.params.id], truckLocation.id]
            );
        } catch (error) {
            this.notification.add(
                trigasGetErrorMessageSafe(
                    error,
                    _t('No se pudo guardar la ubicación del camión escaneada en el picking.')
                ),
                { type: 'danger' }
            );
            return false;
        }

        await this._trigasApplyDisplayOverride(truckLocation, barcodeData);
        return true;
    },

    async _trigasRegisterCustomerLocation(customerLocation, barcodeData) {
        try {
            await this.orm.call(
                'stock.picking',
                'trigas_barcode_register_customer_location',
                [[this.params.id], customerLocation.id]
            );
        } catch (error) {
            this.notification.add(
                trigasGetErrorMessageSafe(
                    error,
                    _t('No se pudo guardar la ubicación del cliente escaneada en el picking.')
                ),
                { type: 'danger' }
            );
            return false;
        }

        await this._trigasApplyDisplayOverride(customerLocation, barcodeData);
        return true;
    },

    _trigasGetCurrentScannedLotIds(extraLotId = false) {
        const lotIds = [];

        if (this.currentState && Array.isArray(this.currentState.lines)) {
            for (const line of this.currentState.lines) {
                const lotId = line?.lot_id?.id || false;
                const qtyDone = line?.qty_done || line?.qtyDone || line?.quantity || 0;

                if (lotId && qtyDone > 0) {
                    lotIds.push(lotId);
                }
            }
        }

        if (extraLotId) {
            lotIds.push(extraLotId);
        }

        return [...new Set(lotIds)];
    },

    async _trigasValidateStep1Serial(lotId) {
        try {
            const clientLotIds = this._trigasGetCurrentScannedLotIds(lotId);

            return await this.orm.call(
                'stock.picking',
                'trigas_barcode_validate_serial_step_1',
                [[this.params.id], lotId, clientLotIds]
            );
        } catch (error) {
            this.notification.add(
                trigasGetErrorMessageSafe(
                    error,
                    _t('El serial escaneado no pertenece a esta orden.')
                ),
                { type: 'danger' }
            );
            return false;
        }
    },

    async _trigasValidateStep2Serial(lotId) {
        try {
            return await this.orm.call(
                'stock.picking',
                'trigas_barcode_validate_serial_step_2',
                [[this.params.id], lotId]
            );
        } catch (error) {
            this.notification.add(
                trigasGetErrorMessageSafe(
                    error,
                    _t('El serial escaneado no es válido para este conduce.')
                ),
                { type: 'danger' }
            );
            return false;
        }
    },


    _trigasIsNativeInternalTransferCandidate() {
        const step = trigasGetStepFromRecordSafe(this);

        if (step === '1' || step === '2') {
            return false;
        }

        const record = this.record || {};
        const pickingTypeCode = (
            record.picking_type_code ||
            record.picking_type_id?.code ||
            record.picking_type_id?.data?.code ||
            ''
        ).toString();

        if (pickingTypeCode === 'internal') {
            return true;
        }

        // Fallback: si no viene el código del tipo de operación,
        // dejamos que el backend decida si aplica o no.
        return true;
    },

    async _trigasValidateNativeInternalSerial(lotId) {
        if (!this._trigasIsNativeInternalTransferCandidate()) {
            return false;
        }

        try {
            const result = await this.orm.call(
                'stock.picking',
                'trigas_barcode_validate_native_serial_scan',
                [[this.params.id], lotId]
            );

            if (result && result.location_name) {
                const sourceLocationForDisplay = {
                    id: result.location_id,
                    display_name: result.location_name,
                    name: result.location_name,
                    complete_name: result.location_name,
                };

                this.__trigasNativeSourceLocationForLines = sourceLocationForDisplay;

                await this._trigasApplySourceDisplayOverride(sourceLocationForDisplay);

                // Al leer el primer serial, Odoo crea la línea después de nuestra validación.
                // Por eso re-aplicamos el origen unos milisegundos después,
                // cuando la línea ya existe visualmente en la PDA.
                setTimeout(async () => {
                    if (this.__trigasNativeSourceLocationForLines) {
                        await this._trigasApplySourceDisplayOverride(this.__trigasNativeSourceLocationForLines);
                    }
                }, 450);

                if (result.source_was_detected && !this.__trigasNativeSourceNotified) {
                    this.__trigasNativeSourceNotified = true;

                    this.notification.add(
                        _t('Ubicación origen detectada: ') + result.location_name,
                        { type: 'success' }
                    );
                }
            }

            return result;
        } catch (error) {
            this.notification.add(
                trigasGetErrorMessageSafe(
                    error,
                    _t('El serial escaneado no pertenece a la ubicación origen de esta transferencia.')
                ),
                { type: 'danger' }
            );
            return false;
        }
    },

    async _trigasRegisterNativeInternalDestination(location, barcodeData) {
        if (!this._trigasIsNativeInternalTransferCandidate()) {
            return false;
        }

        try {
            const result = await this.orm.call(
                'stock.picking',
                'trigas_barcode_register_native_destination_location',
                [[this.params.id], location.id]
            );

            if (result && result.location_name) {
                await this._trigasApplyDisplayOverride(location, barcodeData);
                return result;
            }

            return false;
        } catch (error) {
            this.notification.add(
                trigasGetErrorMessageSafe(
                    error,
                    _t('No se pudo registrar la ubicación destino de la transferencia.')
                ),
                { type: 'danger' }
            );
            return false;
        }
    },

    async _processLocation(barcodeData) {
        const scannedLocation = trigasGetScannedLocationSafe(barcodeData);

        if ((trigasGetStepFromRecordSafe(this) === '1') && trigasIsInternalLocationSafe(scannedLocation)) {
            await this._trigasRegisterTruckLocation(scannedLocation, barcodeData);
            return false;
        }

        if ((trigasGetStepFromRecordSafe(this) === '2') && trigasIsInternalLocationSafe(scannedLocation)) {
            await this._trigasRegisterCustomerLocation(scannedLocation, barcodeData);
            return false;
        }

        if (
            !trigasGetStepFromRecordSafe(this)
            && trigasIsInternalLocationSafe(scannedLocation)
            && this._trigasIsNativeInternalTransferCandidate()
        ) {
            await this._trigasRegisterNativeInternalDestination(scannedLocation, barcodeData);
            return false;
        }

        const result = await BarcodeModel.prototype._processLocation.call(this, barcodeData);
        this._trigasAfterBarcodeUiUpdate();
        return result;
    },

    async _processBarcode(barcode) {
        const step = trigasGetStepFromRecordSafe(this);
        let parsedBarcodeData = false;

        try {
            parsedBarcodeData = await this._parseBarcode(barcode);
        } catch (error) {
            this.notification.add(
                _t('Lectura no permitida para este conduce.'),
                { type: 'danger' }
            );
            return false;
        }

        if (step === '1') {
            if (!parsedBarcodeData?.lot?.id) {
                const location = trigasGetScannedLocationSafe(parsedBarcodeData);
                if (trigasIsInternalLocationSafe(location)) {
                    await this._trigasRegisterTruckLocation(location, parsedBarcodeData);
                } else {
                    this.notification.add(
                        _t('En el Conduce 1 solo puedes leer seriales válidos o la ubicación del camión.'),
                        { type: 'danger' }
                    );
                }
                return false;
            }

            const validStep1 = await this._trigasValidateStep1Serial(parsedBarcodeData.lot.id);
            if (!validStep1) {
                return false;
            }
        }

        if (step === '2') {
            if (!parsedBarcodeData?.lot?.id) {
                const location = trigasGetScannedLocationSafe(parsedBarcodeData);
                if (trigasIsInternalLocationSafe(location)) {
                    await this._trigasRegisterCustomerLocation(location, parsedBarcodeData);
                } else {
                    this.notification.add(
                        _t('En el Conduce 2 solo puedes leer seriales válidos o la ubicación del cliente.'),
                        { type: 'danger' }
                    );
                }
                return false;
            }

            const validStep2 = await this._trigasValidateStep2Serial(parsedBarcodeData.lot.id);
            if (!validStep2) {
                return false;
            }
        }
        if (!step && parsedBarcodeData?.lot?.id && this._trigasIsNativeInternalTransferCandidate()) {
            const nativeResult = await this._trigasValidateNativeInternalSerial(parsedBarcodeData.lot.id);
            if (!nativeResult) {
                return false;
            }
        }

        if (!step && !parsedBarcodeData?.lot?.id) {
            const location = trigasGetScannedLocationSafe(parsedBarcodeData);
            if (trigasIsInternalLocationSafe(location) && this._trigasIsNativeInternalTransferCandidate()) {
                await this._trigasRegisterNativeInternalDestination(location, parsedBarcodeData);
                return false;
            }
        }

        if (step === '1') {

            try {
                await this.orm.call(
                    'stock.picking',
                    'trigas_barcode_validate_step_1_capacity',
                    [[this.params.id]]
                );

            } catch (error) {

                this.notification.add(
                    trigasGetErrorMessageSafe(
                        error,
                        _t('Ya se alcanzó la cantidad máxima permitida para esta orden.')
                    ),
                    { type: 'danger' }
                );

                return false;
            }
        }
        const result = await BarcodeModel.prototype._processBarcode.call(this, barcode);

        if (!step && this.__trigasNativeSourceLocationForLines) {
            await this._trigasApplySourceDisplayOverride(this.__trigasNativeSourceLocationForLines);
        }

        this._trigasAfterBarcodeUiUpdate();
        return result;
    },

    async _processLot(barcodeData) {
        const step = trigasGetStepFromRecordSafe(this);

        if (step === '1' && barcodeData?.lot?.id) {
            const validStep1 = await this._trigasValidateStep1Serial(barcodeData.lot.id);
            if (!validStep1) {
                return false;
            }
        }

        if (step === '2' && barcodeData?.lot?.id) {
            const validStep2 = await this._trigasValidateStep2Serial(barcodeData.lot.id);
            if (!validStep2) {
                return false;
            }
        }

        if (!step && barcodeData?.lot?.id && this._trigasIsNativeInternalTransferCandidate()) {
            const nativeResult = await this._trigasValidateNativeInternalSerial(barcodeData.lot.id);
            if (!nativeResult) {
                return false;
            }
        }

        if (step === '1') {
            try {
                await this.orm.call(
                    'stock.picking',
                    'trigas_barcode_validate_step_1_capacity',
                    [[this.params.id]]
                );
            } catch (error) {
                this.notification.add(
                    trigasGetErrorMessageSafe(
                        error,
                        _t('Ya se alcanzó la cantidad máxima permitida para esta orden.')
                    ),
                    { type: 'danger' }
                );
                return false;
            }
        }

        const result = await BarcodeModel.prototype._processLot.call(this, barcodeData);

        if (!step && this.__trigasNativeSourceLocationForLines) {
            await this._trigasApplySourceDisplayOverride(this.__trigasNativeSourceLocationForLines);
        }

        this._trigasAfterBarcodeUiUpdate();
        return result;
    },

    async _askBeforeAddProduct(...args) {
        const step = trigasGetStepFromRecordSafe(this);

        if (step === '1' || step === '2') {
            return false;
        }

        if (originalAskBeforeAddProduct) {
            return originalAskBeforeAddProduct.call(this, ...args);
        }

        return true;
    },
});

patch(GroupedLineComponent.prototype, 'trigas_4_conduces.GroupedLineComponent', {
    get displaySourceLocation() {
        const line = this.props.line;

        if (line?.trigas_override_source_display_name) {
            return true;
        }

        return super.displaySourceLocation;
    },

    get sourceLocationPath() {
        const line = this.props.line;

        if (line?.trigas_override_source_display_name) {
            return '';
        }

        return super.sourceLocationPath;
    },

    get displayDestinationLocation() {
        const line = this.props.line;

        if (line?.trigas_override_dest_display_name) {
            return true;
        }

        return super.displayDestinationLocation;
    },

    get destinationLocationPath() {
        const line = this.props.line;

        if (line?.trigas_override_dest_display_name) {
            return '';
        }

        return super.destinationLocationPath;
    },
});

patch(LineComponent.prototype, 'trigas_4_conduces.LineComponent', {
    get displaySourceLocation() {
        const line = this.props.line;

        if (line?.trigas_override_source_display_name) {
            return true;
        }

        return super.displaySourceLocation;
    },

    get sourceLocationPath() {
        const line = this.props.line;

        if (line?.trigas_override_source_display_name) {
            return '';
        }

        return super.sourceLocationPath;
    },

    get displayDestinationLocation() {
        const line = this.props.line;

        if (line?.trigas_override_dest_display_name) {
            return true;
        }

        return super.displayDestinationLocation;
    },

    get destinationLocationPath() {
        const line = this.props.line;

        if (line?.trigas_override_dest_display_name) {
            return '';
        }

        return super.destinationLocationPath;
    },
});
