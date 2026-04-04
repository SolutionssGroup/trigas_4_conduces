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
        this._trigasEnsureGlobalPdaButtonWatcher();
        setTimeout(() => {
            this._trigasSyncPdaSignatureButton();
        }, 0);
    },

    _trigasGetStepFromRecord() {
        const record = this.record || {};
        const note = (record.note || '').toString();
        const origin = (record.origin || '').toString();

        if (note.includes('Flujo Trigas paso 1') || origin.includes('Conduce 1')) {
            return '1';
        }
        if (note.includes('Flujo Trigas paso 2') || origin.includes('Conduce 2')) {
            return '2';
        }
        return false;
    },

    _trigasIsTruckFlow() {
        return this._trigasGetStepFromRecord() === '1';
    },

    _trigasIsCustomerFlow() {
        return this._trigasGetStepFromRecord() === '2';
    },

    _trigasIsNativeInternalTransfer() {
        const record = this.record || {};
        const pickingTypeCode =
            record.picking_type_code ||
            record.picking_type_id?.code ||
            false;

        return !record.is_trigas_conduce && pickingTypeCode === 'internal';
    },

    _trigasIsCurrentBarcodePickingDom() {
        const candidates = Array.from(document.querySelectorAll('button, .btn, span, div'));
        return candidates.some(el => {
            const text = (el.innerText || el.textContent || '').trim().toUpperCase();
            return text === 'VALIDAR';
        });
    },

    _trigasShouldShowPdaSignatureButton() {
        return this._trigasIsCustomerFlow() && this._trigasIsCurrentBarcodePickingDom();
    },

    _trigasRemovePdaSignatureButton() {
        const existingButton = document.getElementById('trigas-pda-signature-btn');
        if (existingButton) {
            existingButton.remove();
        }
    },

    _trigasRemovePdaSignatureModal() {
        const existingModal = document.getElementById('trigas-pda-signature-modal');
        if (existingModal) {
            existingModal.remove();
        }
    },

    _trigasEnsureGlobalPdaButtonWatcher() {
        if (window.__trigasPdaButtonWatcherStarted) {
            return;
        }

        window.__trigasPdaButtonWatcherStarted = true;

        window.setInterval(() => {
            const model = window.__trigasBarcodePickingModel;
            const shouldShow = !!(
                model &&
                typeof model._trigasShouldShowPdaSignatureButton === 'function' &&
                model._trigasShouldShowPdaSignatureButton()
            );

            if (!shouldShow) {
                const button = document.getElementById('trigas-pda-signature-btn');
                if (button) {
                    button.remove();
                }

                const modal = document.getElementById('trigas-pda-signature-modal');
                if (modal) {
                    modal.remove();
                }
            }
        }, 500);
    },

    _trigasSyncPdaSignatureButton() {
        if (!this._trigasShouldShowPdaSignatureButton()) {
            this._trigasRemovePdaSignatureButton();
            this._trigasRemovePdaSignatureModal();
            return;
        }

        let button = document.getElementById('trigas-pda-signature-btn');
        if (!button) {
            button = document.createElement('button');
            button.id = 'trigas-pda-signature-btn';
            button.type = 'button';
            button.innerText = _t('Firmar');

            Object.assign(button.style, {
                position: 'fixed',
                right: '16px',
                bottom: '72px',
                zIndex: '9999',
                background: '#00a09d',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                padding: '12px 16px',
                fontSize: '14px',
                fontWeight: '600',
                boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                cursor: 'pointer',
            });

            button.addEventListener('click', async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const model = window.__trigasBarcodePickingModel;
                if (model) {
                    await model._trigasOpenPdaSignatureModal();
                }
            });

            document.body.appendChild(button);
        }
    },

    _trigasGetPartnerDisplayName() {
        const partner = this.record?.partner_id;
        if (!partner) {
            return '';
        }
        return partner.display_name || partner.name || '';
    },

    async _trigasOpenPdaSignatureModal() {
        if (!this._trigasShouldShowPdaSignatureButton()) {
            return;
        }

        this._trigasRemovePdaSignatureModal();

        const overlay = document.createElement('div');
        overlay.id = 'trigas-pda-signature-modal';

        Object.assign(overlay.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(0, 0, 0, 0.55)',
            zIndex: '10000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
        });

        const defaultName =
            this.record?.trigas_delivery_signed_by ||
            this._trigasGetPartnerDisplayName() ||
            '';

        overlay.innerHTML = `
            <div style="
                background: #fff;
                width: 100%;
                max-width: 520px;
                border-radius: 14px;
                padding: 16px;
                box-sizing: border-box;
            ">
                <div style="font-size: 18px; font-weight: 700; margin-bottom: 12px;">
                    ${_t('Firma de entrega')}
                </div>

                <div style="margin-bottom: 10px;">
                    <label style="display:block; font-size:13px; margin-bottom:4px;">
                        ${_t('Nombre de quien recibe')}
                    </label>
                    <input id="trigas-signature-signed-by" type="text" value="${defaultName.replace(/"/g, '&quot;')}"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            padding:10px;
                            border:1px solid #ccc;
                            border-radius:8px;
                            font-size:14px;
                        "/>
                </div>

                <div style="margin-bottom: 8px; font-size:13px;">
                    ${_t('Firma')}
                </div>

                <div style="
                    border:1px solid #ccc;
                    border-radius:10px;
                    overflow:hidden;
                    background:#fff;
                    touch-action:none;
                ">
                    <canvas id="trigas-signature-canvas"
                        style="display:block; width:100%; height:220px; touch-action:none;"></canvas>
                </div>

                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
                    <button id="trigas-signature-clear" type="button"
                        style="padding:10px 12px; border:none; border-radius:8px; background:#e5e7eb;">
                        ${_t('Limpiar')}
                    </button>

                    <button id="trigas-signature-save" type="button"
                        style="padding:10px 12px; border:none; border-radius:8px; background:#00a09d; color:#fff;">
                        ${_t('Guardar firma')}
                    </button>

                    <button id="trigas-signature-save-send" type="button"
                        style="padding:10px 12px; border:none; border-radius:8px; background:#2563eb; color:#fff;">
                        ${_t('Guardar y enviar')}
                    </button>

                    <button id="trigas-signature-cancel" type="button"
                        style="padding:10px 12px; border:none; border-radius:8px; background:#ef4444; color:#fff; margin-left:auto;">
                        ${_t('Cancelar')}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const canvas = overlay.querySelector('#trigas-signature-canvas');
        const input = overlay.querySelector('#trigas-signature-signed-by');
        const clearButton = overlay.querySelector('#trigas-signature-clear');
        const saveButton = overlay.querySelector('#trigas-signature-save');
        const saveSendButton = overlay.querySelector('#trigas-signature-save-send');
        const cancelButton = overlay.querySelector('#trigas-signature-cancel');

        const ctx = canvas.getContext('2d');
        let drawing = false;
        let hasSignature = false;

        const configureCanvas = () => {
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = 220;
            ctx.lineWidth = 2.2;
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#111827';
        };

        configureCanvas();
        setTimeout(configureCanvas, 50);

        const getPoint = (event) => {
            const rect = canvas.getBoundingClientRect();
            const source =
                event.touches?.[0] ||
                event.changedTouches?.[0] ||
                event;
            return {
                x: source.clientX - rect.left,
                y: source.clientY - rect.top,
            };
        };

        const startDrawing = (event) => {
            event.preventDefault();
            const point = getPoint(event);
            drawing = true;
            hasSignature = true;
            ctx.beginPath();
            ctx.moveTo(point.x, point.y);
        };

        const draw = (event) => {
            if (!drawing) {
                return;
            }
            event.preventDefault();
            const point = getPoint(event);
            ctx.lineTo(point.x, point.y);
            ctx.stroke();
        };

        const stopDrawing = (event) => {
            if (!drawing) {
                return;
            }
            event.preventDefault();
            drawing = false;
            ctx.closePath();
        };

        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseleave', stopDrawing);

        canvas.addEventListener('touchstart', startDrawing, { passive: false });
        canvas.addEventListener('touchmove', draw, { passive: false });
        canvas.addEventListener('touchend', stopDrawing, { passive: false });

        clearButton.addEventListener('click', () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            hasSignature = false;
        });

        cancelButton.addEventListener('click', () => {
            overlay.remove();
        });

        const saveSignature = async (sendEmail = false) => {
            const signedBy = (input.value || '').trim();

            if (!signedBy) {
                this.notification.add(
                    _t('Debes indicar el nombre de quien recibe.'),
                    { type: 'danger' }
                );
                return;
            }

            if (!hasSignature) {
                this.notification.add(
                    _t('Debes capturar la firma antes de guardar.'),
                    { type: 'danger' }
                );
                return;
            }

            const dataUrl = canvas.toDataURL('image/png');
            const base64Data = dataUrl.split(',')[1];

            try {
                await this.orm.call(
                    'stock.picking',
                    'trigas_barcode_save_delivery_signature',
                    [[this.params.id], signedBy, base64Data]
                );

                if (sendEmail) {
                    await this.orm.call(
                        'stock.picking',
                        'action_send_trigas_delivery_email',
                        [[this.params.id]]
                    );
                }

                overlay.remove();
                await this._trigasReloadPickingState();

                this.notification.add(
                    sendEmail
                        ? _t('Firma guardada y enviada al cliente.')
                        : _t('Firma guardada correctamente.'),
                    { type: 'success' }
                );
            } catch (error) {
                this.notification.add(
                    this._trigasGetErrorMessage(
                        error,
                        sendEmail
                            ? _t('No se pudo guardar y enviar la firma.')
                            : _t('No se pudo guardar la firma.')
                    ),
                    { type: 'danger' }
                );
            }
        };

        saveButton.addEventListener('click', async () => {
            await saveSignature(false);
        });

        saveSendButton.addEventListener('click', async () => {
            await saveSignature(true);
        });
    },

    _trigasIsInternalLocation(location) {
        return !!(location && location.usage === 'internal');
    },

    _trigasGetScannedLocation(barcodeData) {
        if (!barcodeData) {
            return false;
        }
        return barcodeData.destLocation || barcodeData.location || false;
    },

    _trigasCleanBarcodeData(barcodeData) {
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
    },

    _trigasGetLocationDisplayName(location) {
        return (
            location?.display_name ||
            location?.name ||
            location?.complete_name ||
            _t('Ubicación')
        );
    },

    _trigasGetErrorMessage(error, fallbackMessage) {
        return (
            error?.data?.message ||
            error?.data?.arguments?.[0] ||
            error?.message ||
            fallbackMessage
        );
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

    async _trigasApplyDisplayOverride(location, barcodeData) {
        const displayName = this._trigasGetLocationDisplayName(location);

        if (!this.lastScanned) {
            this.lastScanned = {};
        }

        this.lastScanned.trigas_scanned_location = location;
        this.lastScanned.trigas_scanned_location_display_name = displayName;

        this._trigasCleanBarcodeData(barcodeData);
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
                this._trigasGetErrorMessage(
                    error,
                    _t('No se pudo guardar la ubicación del camión escaneada en el picking.')
                ),
                { type: 'danger' }
            );
            return;
        }

        await this._trigasApplyDisplayOverride(truckLocation, barcodeData);
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
                this._trigasGetErrorMessage(
                    error,
                    _t('No se pudo guardar la ubicación del cliente escaneada en el picking.')
                ),
                { type: 'danger' }
            );
            return;
        }

        await this._trigasApplyDisplayOverride(customerLocation, barcodeData);
    },

    async _trigasRegisterNativeDestinationLocation(location, barcodeData) {
        try {
            const result = await this.orm.call(
                'stock.picking',
                'trigas_barcode_register_native_destination_location',
                [[this.params.id], location.id]
            );

            if (!result) {
                return;
            }

            const displayName = result.location_name || this._trigasGetLocationDisplayName(location);

            if (!this.lastScanned) {
                this.lastScanned = {};
            }

            this.lastScanned.trigas_scanned_location = location;
            this.lastScanned.trigas_scanned_location_display_name = displayName;

            this._trigasCleanBarcodeData(barcodeData);
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
                _t('Ubicación destino cargada: ') + displayName,
                { type: 'success' }
            );

            this.trigger('update');
            this._trigasAfterBarcodeUiUpdate();
        } catch (error) {
            this.notification.add(
                this._trigasGetErrorMessage(
                    error,
                    _t('No se pudo registrar la ubicación destino de la transferencia.')
                ),
                { type: 'danger' }
            );
        }
    },

    async _trigasValidateNativeSerialScan(lotId) {
        try {
            return await this.orm.call(
                'stock.picking',
                'trigas_barcode_validate_native_serial_scan',
                [[this.params.id], lotId]
            );
        } catch (error) {
            this.notification.add(
                this._trigasGetErrorMessage(
                    error,
                    _t('El serial escaneado no es válido para esta transferencia.')
                ),
                { type: 'danger' }
            );
            return false;
        }
    },

    async _trigasGetNativeSerialSourceLocation(lotId) {
        try {
            return await this.orm.call(
                'stock.picking',
                'trigas_barcode_get_native_serial_source_location',
                [[this.params.id], lotId]
            );
        } catch (error) {
            this.notification.add(
                this._trigasGetErrorMessage(
                    error,
                    _t('No se pudo obtener la ubicación origen del serial.')
                ),
                { type: 'danger' }
            );
            return false;
        }
    },

    _trigasFindLineInCurrentStateByLot(lotId, lotName, productId) {
        if (!this.currentState || !Array.isArray(this.currentState.lines)) {
            return false;
        }

        let line = [...this.currentState.lines].reverse().find(l => l?.lot_id?.id === lotId);
        if (line) {
            return line;
        }

        line = [...this.currentState.lines].reverse().find(l => l?.lot_name === lotName);
        if (line) {
            return line;
        }

        line = [...this.currentState.lines].reverse().find(l => l?.product_id?.id === productId);
        if (line) {
            return line;
        }

        return false;
    },

    _trigasApplySourceNameOnLine(targetLine, sourceName) {
        if (!targetLine || !sourceName) {
            return;
        }

        targetLine.trigas_override_source_display_name = sourceName;

        if (!targetLine.location_id) {
            targetLine.location_id = {};
        }

        targetLine.location_id.display_name = sourceName;
        targetLine.location_id.name = sourceName;
        targetLine.location_id.complete_name = sourceName;
    },

    async _trigasApplyNativeSourceLocationOnCurrentLine(barcodeData, sourceInfo = false) {
        if (!barcodeData?.lot?.id) {
            return;
        }

        const finalSourceInfo = sourceInfo || await this._trigasGetNativeSerialSourceLocation(barcodeData.lot.id);
        if (!finalSourceInfo) {
            return;
        }

        await this._trigasReloadPickingState();

        const targetLine = this._trigasFindLineInCurrentStateByLot(
            barcodeData.lot.id,
            barcodeData.lot.name,
            barcodeData.lot.product_id?.id || barcodeData.product?.id
        );

        if (!targetLine) {
            this.notification.add(
                _t('No se encontró la línea del serial en el estado actual del barcode.'),
                { type: 'warning' }
            );
            return;
        }

        this._trigasApplySourceNameOnLine(targetLine, finalSourceInfo.location_name);

        this.trigger('update');
        this._trigasAfterBarcodeUiUpdate();

        this.notification.add(
            _t('Ubicación origen cargada: ') + finalSourceInfo.location_name,
            { type: 'success' }
        );
    },

    async _processLocation(barcodeData) {
        const scannedLocation = this._trigasGetScannedLocation(barcodeData);

        if (this._trigasIsTruckFlow() && this._trigasIsInternalLocation(scannedLocation)) {
            await this._trigasRegisterTruckLocation(scannedLocation, barcodeData);
            return;
        }

        if (this._trigasIsCustomerFlow() && this._trigasIsInternalLocation(scannedLocation)) {
            await this._trigasRegisterCustomerLocation(scannedLocation, barcodeData);
            return;
        }

        if (this._trigasIsNativeInternalTransfer() && this._trigasIsInternalLocation(scannedLocation)) {
            await this._trigasRegisterNativeDestinationLocation(scannedLocation, barcodeData);
            return;
        }

        const result = await BarcodeModel.prototype._processLocation.call(this, barcodeData);
        this._trigasAfterBarcodeUiUpdate();
        return result;
    },

    async _processBarcode(barcode) {
        const step = this._trigasGetStepFromRecord();
        let parsedBarcodeData = false;
        let nativeSourceInfo = false;

        try {
            parsedBarcodeData = await this._parseBarcode(barcode);
        } catch (error) {
            const fallbackResult = await BarcodeModel.prototype._processBarcode.call(this, barcode);
            this._trigasAfterBarcodeUiUpdate();
            return fallbackResult;
        }

        if (step === '2' && parsedBarcodeData?.lot?.id) {
            try {
                await this.orm.call(
                    'stock.picking',
                    'trigas_barcode_validate_serial_step_2',
                    [[this.params.id], parsedBarcodeData.lot.id]
                );
            } catch (error) {
                this.notification.add(
                    this._trigasGetErrorMessage(
                        error,
                        _t('El serial escaneado no es válido para este conduce.')
                    ),
                    { type: 'danger' }
                );
                return;
            }
        }

        if (!step && this._trigasIsNativeInternalTransfer() && parsedBarcodeData?.lot?.id) {
            nativeSourceInfo = await this._trigasValidateNativeSerialScan(parsedBarcodeData.lot.id);
            if (!nativeSourceInfo) {
                return;
            }
        }

        const result = await BarcodeModel.prototype._processBarcode.call(this, barcode);

        if (!step && this._trigasIsNativeInternalTransfer() && parsedBarcodeData?.lot?.id) {
            await this._trigasApplyNativeSourceLocationOnCurrentLine(parsedBarcodeData, nativeSourceInfo);
        }

        this._trigasAfterBarcodeUiUpdate();
        return result;
    },

    async _processLot(barcodeData) {
        const step = this._trigasGetStepFromRecord();
        let nativeSourceInfo = false;

        if (step === '2' && barcodeData?.lot?.id) {
            try {
                await this.orm.call(
                    'stock.picking',
                    'trigas_barcode_validate_serial_step_2',
                    [[this.params.id], barcodeData.lot.id]
                );
            } catch (error) {
                this.notification.add(
                    this._trigasGetErrorMessage(
                        error,
                        _t('El serial escaneado no es válido para este conduce.')
                    ),
                    { type: 'danger' }
                );
                return;
            }
        }

        if (!step && this._trigasIsNativeInternalTransfer() && barcodeData?.lot?.id) {
            nativeSourceInfo = await this._trigasValidateNativeSerialScan(barcodeData.lot.id);
            if (!nativeSourceInfo) {
                return;
            }
        }

        const result = await BarcodeModel.prototype._processLot.call(this, barcodeData);

        if (!step && this._trigasIsNativeInternalTransfer() && barcodeData?.lot?.id) {
            await this._trigasApplyNativeSourceLocationOnCurrentLine(barcodeData, nativeSourceInfo);
        }

        this._trigasAfterBarcodeUiUpdate();
        return result;
    },

    async _askBeforeAddProduct(...args) {
        const step = this._trigasGetStepFromRecord();

        if (step === '2') {
            return originalAskBeforeAddProduct.call(this, ...args);
        }

        if (originalAskBeforeAddProduct) {
            return originalAskBeforeAddProduct.call(this, ...args);
        }

        return true;
    },
});

patch(GroupedLineComponent.prototype, 'trigas_4_conduces.GroupedLineComponent', {
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
});

patch(LineComponent.prototype, 'trigas_4_conduces.LineComponent', {
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
});