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

function trigasGoToOperaciones() {
    window.location.href = '/web#action=407&model=stock.picking.type&view_type=kanban&menu_id=246&cids=1';
}

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

function trigasIsCustomerLocationSafe(location) {
    return !!(location && location.usage === 'customer');
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

    if (record.trigas_false && step === '3') {
        return false; // TRI3 nativo Odoo
    }

    const note = (record.note || '').toString();
    const origin = (record.origin || '').toString();
    const name = (record.name || '').toString();
    const bodyText = document.body ? (document.body.innerText || '') : '';

    if (note.includes('Flujo Trigas paso 1') || origin.includes('Conduce 1')) {
        return '1';
    }

    if (note.includes('Flujo Trigas paso 2') || origin.includes('Conduce 2')) {
        return '2';
    }

    if (
        note.includes('Flujo Trigas paso 3') ||
        origin.includes('Recogida') ||
        origin.includes('Recogida abierta de cilindros') ||
        false ||
        false
    ) {
        return '3';
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

        if (record.trigas_false && step === '3') {
            return false; // TRI3 nativo Odoo
        }

        const note = (record.note || '').toString();
        const origin = (record.origin || '').toString();
        const name = (record.name || '').toString();
        const bodyText = document.body ? (document.body.innerText || '') : '';

        if (note.includes('Flujo Trigas paso 1') || origin.includes('Conduce 1')) {
            return '1';
        }

        if (note.includes('Flujo Trigas paso 2') || origin.includes('Conduce 2')) {
            return '2';
        }

        if (
            note.includes('Flujo Trigas paso 3') ||
            origin.includes('Recogida') ||
            origin.includes('Recogida abierta de cilindros') ||
            false ||
            false
        ) {
            return '3';
        }

        return false;
    };
}


function trigasFindScrollParentSafe(element) {
    let parent = element ? element.parentElement : null;

    while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        const overflowY = style.overflowY;

        if (
            (overflowY === 'auto' || overflowY === 'scroll') &&
            parent.scrollHeight > parent.clientHeight
        ) {
            return parent;
        }

        parent = parent.parentElement;
    }

    return document.scrollingElement || document.documentElement;
}

function trigasHighlightAndScrollLastScannedLine() {
    const root = document.querySelector('.o_barcode_client_action');
    if (!root) {
        return;
    }

    const line =
        root.querySelector('.o_barcode_line.o_selected') ||
        root.querySelector('.o_barcode_line.border-primary') ||
        root.querySelector('.o_barcode_line.border-info') ||
        root.querySelector('.o_barcode_line[style*="border"]') ||
        root.querySelector('.o_barcode_line');

    if (!line) {
        return;
    }

    root.querySelectorAll('.trigas-last-scanned-line').forEach((existingLine) => {
        existingLine.classList.remove('trigas-last-scanned-line');
    });

    line.classList.add('trigas-last-scanned-line');

    const scrollParent = trigasFindScrollParentSafe(line);
    const parentRect = scrollParent.getBoundingClientRect
        ? scrollParent.getBoundingClientRect()
        : { top: 0 };

    const lineRect = line.getBoundingClientRect();

    // Encabezado morado + letrero ESCANEAR PRODUCTO + margen.
    const topOffset = 122;
    const delta = lineRect.top - parentRect.top - topOffset;

    scrollParent.scrollTop += delta;
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
        this._trigasScheduleSimpleSerialList();
          this._trigasScheduleTri3TruckDestinationBadge();
    },



      _trigasScheduleTri3TruckDestinationBadge() {
          if (this.__trigasTri3TruckDestinationBadgeTimer) {
              clearTimeout(this.__trigasTri3TruckDestinationBadgeTimer);
          }

          this.__trigasTri3TruckDestinationBadgeTimer = setTimeout(() => {
              this._trigasRenderTri3TruckDestinationBadge();
          }, 250);

          setTimeout(() => {
              this._trigasRenderTri3TruckDestinationBadge();
          }, 900);
      },

      async _trigasRenderTri3TruckDestinationBadge(forcedLocationName) {
          const root = document.querySelector('.o_barcode_client_action');
          if (!root) {
              return;
          }

          const existing = root.querySelector('.trigas-tri3-truck-destination-badge');

          if (!this._trigasIsTri3NativeScreen || !this._trigasIsTri3NativeScreen()) {
              if (existing) {
                  existing.remove();
              }
              return;
          }

          let locationName = forcedLocationName || this.__trigasTri3TruckDestinationName || '';

          if (!locationName) {
              const pickingId = this._trigasGetCurrentPickingIdForPda();
              if (pickingId) {
                  try {
                      const state = await this.orm.call(
                          'stock.picking',
                          'trigas_barcode_get_step_3_state',
                          [[pickingId]]
                      );

                      if (state && state.has_truck && state.truck_location_name) {
                          locationName = state.truck_location_name;
                          this.__trigasTri3TruckDestinationName = locationName;
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
      },

    _trigasMarkLastScannedLineVisual() {
        setTimeout(() => {
            trigasHighlightAndScrollLastScannedLine();
        }, 120);

        setTimeout(() => {
            trigasHighlightAndScrollLastScannedLine();
        }, 450);
    },


    _trigasScheduleSimpleSerialList() {
        if (this.__trigasSimpleSerialListTimer) {
            clearTimeout(this.__trigasSimpleSerialListTimer);
        }

        this.__trigasSimpleSerialListTimer = setTimeout(() => {
            this._trigasRenderSimpleSerialList();
        }, 300);

        setTimeout(() => {
            this._trigasRenderSimpleSerialList();
        }, 900);
    },

    _trigasGetCurrentPickingIdForPda() {
        if (this.params && this.params.id) {
            return this.params.id;
        }

        if (this.resId) {
            return this.resId;
        }

        if (this.config && this.config.resId) {
            return this.config.resId;
        }

        const hash = window.location.hash || '';
        const match = hash.match(/active_id=(\d+)/);
        if (match && match[1]) {
            return Number(match[1]);
        }

        return false;
    },

    async _trigasRenderSimpleSerialList() {
        const root = document.querySelector('.o_barcode_client_action');
        if (!root) {
            return;
        }

        const pickingId = this._trigasGetCurrentPickingIdForPda();
        if (!pickingId) {
            console.log('TRIGAS: no se pudo determinar pickingId para lista de seriales');
            return;
        }

        const productLine = root.querySelector('.o_barcode_line');
        if (!productLine) {
            console.log('TRIGAS: no se encontró .o_barcode_line para lista de seriales');
            return;
        }

        let serialBox = productLine.querySelector('.trigas-simple-serial-list');
        if (!serialBox) {
            serialBox = document.createElement('div');
            serialBox.className = 'trigas-simple-serial-list';
            productLine.appendChild(serialBox);
        }

        let serials = [];
        try {
            serials = await this.orm.call(
                'stock.picking',
                'trigas_barcode_get_scanned_serials_for_pda',
                [[pickingId]]
            );
        } catch (error) {
            console.log('TRIGAS: error consultando seriales PDA', error);
            return;
        }

        console.log('TRIGAS: seriales PDA', serials);

        serialBox.innerHTML = '';

        if (!serials || !serials.length) {
            serialBox.style.display = 'none';
            return;
        }

        serialBox.style.display = 'block';

        const title = document.createElement('div');
        title.className = 'trigas-simple-serial-title';
        title.textContent = 'Seriales escaneados';
        serialBox.appendChild(title);

        const list = document.createElement('div');
        list.className = 'trigas-simple-serial-items';

        for (const item of serials) {
            const row = document.createElement('div');
            row.className = 'trigas-simple-serial-row';
            row.textContent = item.serial;
            list.appendChild(row);
        }

        serialBox.appendChild(list);
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
        // TRI3 tiene su propio control de botones 100% frontend.
        // Evitamos consultas repetitivas al backend en Recogida Cliente.
        if (this._trigasIsTri3NativeScreen && this._trigasIsTri3NativeScreen()) {
            this._trigasRemoveSignatureButton();
            return;
        }

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

        if (step === '1' || step === '2' || false && step === '3') {
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

    async _trigasProcessStep3RawBarcode(barcode) {
        try {
            const result = await this.orm.call(
                'stock.picking',
                'trigas_barcode_process_raw_scan_step_3',
                [[this.params.id], barcode]
            );

            // PDA: no mostrar toast verde por serial leído.
            // La confirmación visual queda en la línea/lista de la pantalla.

            this.trigger('refresh');
            this._trigasAfterBarcodeUiUpdate();

            return false;

        } catch (error) {
            this.notification.add(
                trigasGetErrorMessageSafe(
                    error,
                    _t('No se pudo procesar la lectura en Recogida Cliente.')
                ),
                { type: 'danger' }
            );

            this.trigger('refresh');
            return false;
        }
    },

    async _trigasProcessStep3NativeBarcode(barcode) {
        return await this._trigasProcessStep3RawBarcode(barcode);
    },


    _trigasIsTri3NativeScreen() {
        const bodyText = document.body ? (document.body.innerText || '') : '';
        return bodyText.includes('WH/TRI3/');
    },

    async _trigasProcessTri3AnyOriginSerial(barcodeData) {
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
            const result = await this.orm.call(
                'stock.picking',
                'trigas_tri3_add_serial_from_any_origin',
                [[this.params.id], serialName]
            );

            if (!result || !result.ok) {
                this.notification.add(
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
                  await this._trigasReloadPickingState();
              } catch (e) {
                  // Si no aplica, usamos eventos nativos del modelo.
              }

              this.trigger('refresh');
              this.trigger('update');
              this._trigasAfterBarcodeUiUpdate();

              return false;

        } catch (error) {
            this.notification.add(
                trigasGetErrorMessageSafe(
                    error,
                    _t('No se pudo agregar el serial desde su ubicación real.')
                ),
                { type: 'danger' }
            );
            return false;
        }
    },




    async _trigasTryProcessTri3TruckDestinationFromBarcode(barcode, parsedBarcodeData) {
        if (!this._trigasIsTri3NativeScreen || !this._trigasIsTri3NativeScreen()) {
            return false;
        }

        const scannedLocation = trigasGetScannedLocationSafe(parsedBarcodeData);

        if (scannedLocation) {
            return await this._trigasProcessTri3TruckDestination(parsedBarcodeData);
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
            return await this._trigasProcessTri3TruckDestination(rawCode);
        }

        return false;
    },


    async _trigasProcessTri3TruckDestination(barcodeData) {
        const scannedLocation = trigasGetScannedLocationSafe(barcodeData);

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
            const result = await this.orm.call(
                'stock.picking',
                'trigas_tri3_set_truck_destination_from_barcode',
                [[this.params.id], locationCode]
            );

            if (!result || !result.ok) {
                this.notification.add(
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
                await this._trigasReloadPickingState();
            } catch (e) {}

              this.__trigasTri3TruckDestinationName = result.location_name || result.locationName || '';
              this._trigasRenderTri3TruckDestinationBadge(this.__trigasTri3TruckDestinationName);

            this.trigger('refresh');
            this.trigger('update');
            this._trigasAfterBarcodeUiUpdate();

            return true;

        } catch (error) {
            this.notification.add(
                trigasGetErrorMessageSafe(
                    error,
                    _t('No se pudo registrar el camión destino.')
                ),
                { type: 'danger' }
            );
            return true;
        }
    },


    async _processLocation(barcodeData) {
        const scannedLocation = trigasGetScannedLocationSafe(barcodeData);

        if (this._trigasIsTri3NativeScreen && this._trigasIsTri3NativeScreen() && scannedLocation) {
            return await this._trigasProcessTri3TruckDestination(barcodeData);
        }

        if ((trigasGetStepFromRecordSafe(this) === '1') && trigasIsInternalLocationSafe(scannedLocation)) {
            await this._trigasRegisterTruckLocation(scannedLocation, barcodeData);
            return false;
        }

        if ((trigasGetStepFromRecordSafe(this) === '2') && trigasIsCustomerLocationSafe(scannedLocation)) {
            await this._trigasRegisterCustomerLocation(scannedLocation, barcodeData);
            return false;
        }

        if ((false && trigasGetStepFromRecordSafe(this) === '3') && scannedLocation) {
            await this._trigasProcessStep3RawBarcode(
                scannedLocation.barcode || scannedLocation.name || scannedLocation.display_name
            );
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
        let step = trigasGetStepFromRecordSafe(this);

        // Seguro fuerte para Recogida de Cilindros.
        // En TRI3 el conduce es abierto: no debe pasar primero por el flujo nativo,
        // porque Odoo espera líneas/productos y el picking puede estar vacío.
        const bodyText = document.body ? (document.body.innerText || '') : '';
        const isTri3Screen = (
            false && step === '3' ||
            false ||
            false ||
            false
        );

        if (isTri3Screen) {
            return await this._trigasProcessStep3RawBarcode(barcode);
        }

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

        if (this._trigasIsTri3NativeScreen && this._trigasIsTri3NativeScreen()) {
            const tri3TruckDestinationHandled = await this._trigasTryProcessTri3TruckDestinationFromBarcode(
                barcode,
                parsedBarcodeData
            );

            if (tri3TruckDestinationHandled === false) {
                // sigue flujo normal
            } else {
                return false;
            }
        }

        if (this._trigasIsTri3NativeScreen() && parsedBarcodeData?.lot?.id) {
            return await this._trigasProcessTri3AnyOriginSerial(parsedBarcodeData);
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
                if (trigasIsCustomerLocationSafe(location)) {
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

        if (parsedBarcodeData?.lot?.id) {
            this._trigasMarkLastScannedLineVisual();
        }

        return result;
    },

    async _processLot(barcodeData) {
        const step = trigasGetStepFromRecordSafe(this);
        const bodyText = document.body ? (document.body.innerText || '') : '';
        const isTri3Screen = (
            false && step === '3' ||
            false ||
            false ||
            false
        );

        if (this._trigasIsTri3NativeScreen() && barcodeData?.lot?.id) {
            return await this._trigasProcessTri3AnyOriginSerial(barcodeData);
        }

        if (isTri3Screen && barcodeData?.lot?.name) {
            console.log('TRIGAS TRI3: _processLot interceptado antes de Odoo nativo:', barcodeData.lot.name);
            return await this._trigasProcessStep3RawBarcode(barcodeData.lot.name);
        }

        if (isTri3Screen && barcodeData?.lot?.id) {
            console.log('TRIGAS TRI3: _processLot interceptado por lot id antes de Odoo nativo:', barcodeData.lot.id);
            try {
                const result = await this.orm.call(
                    'stock.picking',
                    'trigas_barcode_validate_serial_step_3',
                    [[this.params.id], barcodeData.lot.id]
                );

                // PDA: no mostrar toast verde por serial leído.
                // La confirmación visual queda en la línea/lista de la pantalla.

                this.trigger('refresh');
                this._trigasAfterBarcodeUiUpdate();

                return false;

            } catch (error) {
                this.notification.add(
                    trigasGetErrorMessageSafe(
                        error,
                        _t('No se pudo registrar el serial en la recogida.')
                    ),
                    { type: 'danger' }
                );

                this.trigger('refresh');
                return false;
            }
        }

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

        if (barcodeData?.lot?.id) {
            this._trigasMarkLastScannedLineVisual();
        }

        return result;
    },

    async _askBeforeAddProduct(...args) {
        const step = trigasGetStepFromRecordSafe(this);

        if (step === '1' || step === '2' || false && step === '3') {
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


/**
 * TRIGAS PDA:
 * Activa estilos visuales SOLO en pantallas de Código de barras Trigas.
 * Protegido para no romper si document.body todavía no existe.
 */
function trigasUpdateBarcodeVisualScopeClassSafe() {
    if (!document.body) {
        return;
    }

    const bodyText = document.body.innerText || '';

    const normalizedText = bodyText
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const hash = (window.location.hash || '').toLowerCase();
    const href = (window.location.href || '').toLowerCase();

    const isBarcodeMenu = (
        normalizedText.includes('codigo de barras') ||
        hash.includes('menu_id=246') ||
        href.includes('menu_id=246')
    );

    const hasBarcodeClientAction = !!document.querySelector('.o_barcode_client_action');

    // Listado de traslados pendientes de "Recogida de Cilindros": se integra
    // al mismo diseño amigable que Entrega a Camión / Entrega a Cliente.
    // La condición requiere texto visible ("recogida de cilindros") para no
    // activarse en action=406 mostrando pickings TRI1/TRI2.
    const isTri3ListScreen = (
        !hasBarcodeClientAction &&
        (
            normalizedText.includes('recogida de cilindros') ||
            (href.includes('stock_picking_type') && href.includes('tri3'))
        )
    );

    const isTrigasListScreen = (
        normalizedText.includes('entrega a camion') ||
        normalizedText.includes('entrega a cliente') ||
        normalizedText.includes('orden:') ||
        normalizedText.includes('wh/tri1') ||
        normalizedText.includes('wh/tri2') ||
        isTri3ListScreen
    );

    const isTrigasDetailScreen = (
        hasBarcodeClientAction &&
        (
            normalizedText.includes('wh/tri1') ||
            normalizedText.includes('wh/tri2')
        )
    );

    const isNativeInternalTransferScreen = (
        normalizedText.includes('transferencias internas') ||
        normalizedText.includes('wh/int') ||
        normalizedText.includes('crear un nuevo traslado')
    );

    // El detalle/escaneo de TRI3 (WH/TRI3/...) sigue siendo 100% nativo: tiene
    // su propio flujo y estilos dedicados (trigas-tri3-*). Solo el listado de
    // traslados pendientes ("Recogida de Cilindros") se integra al diseño
    // amigable común.
    const isNativeTri3DetailScreen = (
        hasBarcodeClientAction &&
        normalizedText.includes('wh/tri3')
    );

    const shouldEnable = !!(
        !isNativeInternalTransferScreen &&
        !isNativeTri3DetailScreen &&
        (
            (isBarcodeMenu && isTrigasListScreen) ||
            isTrigasDetailScreen
        )
    );

    document.body.classList.toggle(
        'trigas-barcode-operational-screen',
        shouldEnable
    );

    // Clase específica para la lista de Recogida de Cilindros (TRI3).
    // Solo se activa cuando el texto visible confirma ese contexto,
    // evitando que action=406 con pickings TRI1/TRI2 la herede.
    document.body.classList.toggle(
        'trigas-tri3-list-active',
        isTri3ListScreen && !isNativeInternalTransferScreen
    );
}

function trigasStartBarcodeVisualScopeSafe() {
    if (window.__trigasBarcodeVisualScopeStarted) {
        return;
    }

    if (!document.body) {
        setTimeout(trigasStartBarcodeVisualScopeSafe, 100);
        return;
    }

    window.__trigasBarcodeVisualScopeStarted = true;

    trigasUpdateBarcodeVisualScopeClassSafe();

    setInterval(trigasUpdateBarcodeVisualScopeClassSafe, 300);

    window.addEventListener('hashchange', trigasUpdateBarcodeVisualScopeClassSafe);
    window.addEventListener('popstate', trigasUpdateBarcodeVisualScopeClassSafe);

    const observer = new MutationObserver(() => {
        trigasUpdateBarcodeVisualScopeClassSafe();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trigasStartBarcodeVisualScopeSafe);
} else {
    trigasStartBarcodeVisualScopeSafe();
}




function trigasUpdateVisualQtyCounterFromSerials(serialCount) {
    const root = document.querySelector('.o_barcode_client_action');
    if (!root) {
        return;
    }

    const candidates = [...root.querySelectorAll('span, div')].filter((el) => {
        const txt = (el.textContent || '').trim();
        return /^\d+\s*\/\s*\d+$/.test(txt);
    });

    if (!candidates.length) {
        return;
    }

    const counter = candidates[0];
    const currentText = (counter.textContent || '').trim();
    const parts = currentText.split('/').map((p) => p.trim());

    if (parts.length !== 2) {
        return;
    }

    const total = parts[1];
    counter.textContent = serialCount + ' / ' + total;
}






function trigasGetPdaPickingIdFromUrl() {
    const hash = window.location.hash || '';
    const match = hash.match(/active_id=(\d+)/);
    return match && match[1] ? Number(match[1]) : false;
}

function trigasUpdateVisualQtyCounterFromSerials(serialCount) {
    const root = document.querySelector('.o_barcode_client_action');
    if (!root) {
        return;
    }

    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                const txt = (node.nodeValue || '').trim();
                return /^\d+\s*\/\s*\d+$/.test(txt)
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
            }
        }
    );

    const node = walker.nextNode();
    if (!node) {
        return;
    }

    const txt = (node.nodeValue || '').trim();
    const parts = txt.split('/').map((p) => p.trim());
    if (parts.length === 2) {
        node.nodeValue = serialCount + ' / ' + parts[1];
    }
}

/**
 * TRIGAS PDA:
 * Lista desplegable de seriales escaneados debajo del producto.
 */
async function trigasRenderStandaloneSerialListForPda() {
    if (!document.body || !document.body.classList.contains('trigas-barcode-operational-screen')) {
        return [];
    }

    const root = document.querySelector('.o_barcode_client_action');
    if (!root) {
        return [];
    }

    const pickingId = trigasGetPdaPickingIdFromUrl();
    if (!pickingId) {
        return [];
    }

    const productLine = root.querySelector('.o_barcode_line');
    if (!productLine) {
        return [];
    }

    let serialBox = productLine.querySelector('.trigas-simple-serial-list');
    if (!serialBox) {
        serialBox = document.createElement('div');
        serialBox.className = 'trigas-simple-serial-list trigas-serial-collapsed';
        productLine.appendChild(serialBox);
    }

    const wasExpanded = serialBox.classList.contains('trigas-serial-expanded');

    let serials = [];
    try {
        const response = await fetch('/web/dataset/call_kw/stock.picking/trigas_barcode_get_scanned_serials_for_pda', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials: 'same-origin',
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'call',
                params: {
                    model: 'stock.picking',
                    method: 'trigas_barcode_get_scanned_serials_for_pda',
                    args: [[pickingId]],
                    kwargs: {},
                },
                id: Date.now(),
            }),
        });

        const data = await response.json();
        serials = data.result || [];
    } catch (error) {
        console.log('TRIGAS PDA: error cargando seriales', error);
        return [];
    }

    trigasUpdateVisualQtyCounterFromSerials(serials.length);

    serialBox.innerHTML = '';

    if (!serials.length) {
        serialBox.style.display = 'none';
        return [];
    }

    serialBox.style.display = 'block';
    serialBox.classList.toggle('trigas-serial-expanded', wasExpanded);
    serialBox.classList.toggle('trigas-serial-collapsed', !wasExpanded);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'trigas-simple-serial-toggle';
    toggle.innerHTML = `
        <span>Seriales escaneados (${serials.length})</span>
        <span class="trigas-simple-serial-arrow">${wasExpanded ? '▲' : '▼'}</span>
    `;

    toggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const expanded = serialBox.classList.toggle('trigas-serial-expanded');
        serialBox.classList.toggle('trigas-serial-collapsed', !expanded);

        const arrow = serialBox.querySelector('.trigas-simple-serial-arrow');
        if (arrow) {
            arrow.textContent = expanded ? '▲' : '▼';
        }
    });

    serialBox.appendChild(toggle);

    const list = document.createElement('div');
    list.className = 'trigas-simple-serial-items';

    serials.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'trigas-simple-serial-row';

        const serialText = document.createElement('span');
        serialText.className = 'trigas-simple-serial-name';
        serialText.textContent = item.serial;

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'trigas-simple-serial-delete';
        deleteButton.textContent = 'Borrar';

        deleteButton.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const confirmDelete = window.confirm('Borrar el serial ' + item.serial + ' de este conduce?');
            if (!confirmDelete) {
                return;
            }

            try {
                const response = await fetch('/web/dataset/call_kw/stock.picking/trigas_barcode_remove_scanned_serial_for_pda', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'call',
                        params: {
                            model: 'stock.picking',
                            method: 'trigas_barcode_remove_scanned_serial_for_pda',
                            args: [[pickingId], item.serial],
                            kwargs: {},
                        },
                        id: Date.now(),
                    }),
                });

                const data = await response.json();
                const remaining = data.result && data.result.serials ? data.result.serials : [];

                trigasUpdateVisualQtyCounterFromSerials(remaining.length);
                await trigasTempRenderSerialListSafe(true);
            } catch (error) {
                console.log('TRIGAS PDA: error borrando serial', error);
                window.alert('No se pudo borrar el serial.');
            }
        });

        row.appendChild(serialText);
        row.appendChild(deleteButton);
        list.appendChild(row);
    });

    serialBox.appendChild(list);

    return serials;
}



/* =========================================================
   TRIGAS PDA - Seriales temporales en frontend
   Escanear/Borrar rápido. Guardar al salir o validar.
   ========================================================= */

function trigasTempGetPickingId() {
    const hash = window.location.hash || '';
    const match = hash.match(/active_id=(\d+)/);
    return match && match[1] ? Number(match[1]) : false;
}

function trigasTempGetKey() {
    const pickingId = trigasTempGetPickingId();
    return pickingId ? 'trigas_temp_serials_' + pickingId : false;
}

function trigasTempGetSerials() {
    const key = trigasTempGetKey();
    if (!key) {
        return [];
    }

    try {
        return JSON.parse(window.sessionStorage.getItem(key) || '[]');
    } catch (error) {
        return [];
    }
}

function trigasTempSetSerials(serials) {
    const key = trigasTempGetKey();
    if (!key) {
        return;
    }

    window.sessionStorage.setItem(key, JSON.stringify(serials || []));
}

function trigasTempClearSerials() {
    const key = trigasTempGetKey();
    if (key) {
        window.sessionStorage.removeItem(key);
    }
}

function trigasTempGetExpectedQty() {
    const root = document.querySelector('.o_barcode_client_action');
    if (!root) {
        return 0;
    }

    const match = (root.innerText || '').match(/(\d+)\s*\/\s*(\d+)/);
    if (match && match[2]) {
        return Number(match[2]);
    }

    return 0;
}

function trigasTempUpdateCounter(serialCount) {
    const root = document.querySelector('.o_barcode_client_action');
    if (!root) {
        return;
    }

    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                const txt = (node.nodeValue || '').trim();
                return /^\d+\s*\/\s*\d+$/.test(txt)
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
            }
        }
    );

    const node = walker.nextNode();
    if (!node) {
        return;
    }

    const txt = (node.nodeValue || '').trim();
    const parts = txt.split('/').map((p) => p.trim());

    if (parts.length === 2) {
        node.nodeValue = serialCount + ' / ' + parts[1];
    }
}

function trigasTempRenderSerialList(forceExpanded = false) {
    if (!document.body || !document.body.classList.contains('trigas-barcode-operational-screen')) {
        return;
    }

    const root = document.querySelector('.o_barcode_client_action');
    if (!root) {
        return;
    }

    const productLine = root.querySelector('.o_barcode_line');
    if (!productLine) {
        return;
    }

    const serials = trigasTempGetSerials();
    trigasTempUpdateCounter(serials.length);

    let serialBox = productLine.querySelector('.trigas-simple-serial-list');
    if (!serialBox) {
        serialBox = document.createElement('div');
        serialBox.className = 'trigas-simple-serial-list trigas-serial-collapsed';
        productLine.appendChild(serialBox);
    }

    const wasExpanded = forceExpanded || serialBox.classList.contains('trigas-serial-expanded');

    serialBox.innerHTML = '';

    if (!serials.length) {
        serialBox.style.display = 'none';
        return;
    }

    serialBox.style.display = 'block';
    serialBox.classList.toggle('trigas-serial-expanded', wasExpanded);
    serialBox.classList.toggle('trigas-serial-collapsed', !wasExpanded);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'trigas-simple-serial-toggle';
    toggle.innerHTML = `
        <span>Seriales escaneados (${serials.length})</span>
        <span class="trigas-simple-serial-arrow">${wasExpanded ? '▲' : '▼'}</span>
    `;

    toggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const expanded = serialBox.classList.toggle('trigas-serial-expanded');
        serialBox.classList.toggle('trigas-serial-collapsed', !expanded);

        const arrow = serialBox.querySelector('.trigas-simple-serial-arrow');
        if (arrow) {
            arrow.textContent = expanded ? '▲' : '▼';
        }
    });

    serialBox.appendChild(toggle);

    const list = document.createElement('div');
    list.className = 'trigas-simple-serial-items';

    serials.forEach((serial) => {
        const row = document.createElement('div');
        row.className = 'trigas-simple-serial-row';

        const serialText = document.createElement('span');
        serialText.className = 'trigas-simple-serial-name';
        serialText.textContent = serial;

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'trigas-simple-serial-delete';
        deleteButton.textContent = 'Borrar';

        deleteButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            const updated = trigasTempGetSerials().filter((s) => s !== serial);
            trigasTempSetSerials(updated);
            trigasTempRenderSerialList(true);
        });

        row.appendChild(serialText);
        row.appendChild(deleteButton);
        list.appendChild(row);
    });

    serialBox.appendChild(list);
}

async function trigasTempSaveSerialsToBackend() {
    const pickingId = trigasTempGetPickingId();
    if (!pickingId) {
        return false;
    }

    const serials = trigasTempGetSerials();

    const response = await fetch('/web/dataset/call_kw/stock.picking/trigas_barcode_save_temp_serials_for_pda', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        credentials: 'same-origin',
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'call',
            params: {
                model: 'stock.picking',
                method: 'trigas_barcode_save_temp_serials_for_pda',
                args: [[pickingId], serials],
                kwargs: {},
            },
            id: Date.now(),
        }),
    });

    const data = await response.json();

    if (data.error) {
        throw data.error;
    }

    return data.result;
}

function trigasTempAddSerial(serialName) {
    if (!serialName) {
        return false;
    }

    const serials = trigasTempGetSerials();

    if (serials.includes(serialName)) {
        return false;
    }

    const expectedQty = trigasTempGetExpectedQty();
    if (expectedQty && serials.length >= expectedQty) {
        return false;
    }

    serials.push(serialName);
    trigasTempSetSerials(serials);
    trigasTempRenderSerialList(true);
    return true;
}

async function trigasTempHandleValidateButton(button) {
    if (window.__trigasAllowValidateAfterTempSave) {
        return;
    }

    const serials = trigasTempGetSerials();
    if (!serials.length) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    try {
        // TRI3/frontend temporal: no guardar automáticamente al salir.
        // El guardado real debe ocurrir solo al validar la operación.

        window.__trigasAllowValidateAfterTempSave = true;
        button.click();

        setTimeout(() => {
            window.__trigasAllowValidateAfterTempSave = false;
        }, 1000);
    } catch (error) {
        console.log('TRIGAS PDA: error guardando antes de validar', error);
        window.alert('No se pudieron guardar los seriales antes de validar.');
    }
}

async function trigasTempHandleBackButton(event) {
    const serials = trigasTempGetSerials();
    if (!serials.length) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    try {
        // TRI3/frontend temporal: no guardar automáticamente al salir.
        // El guardado real debe ocurrir solo al validar la operación.
        trigasTempClearSerials();
        trigasGoToOperaciones();
    } catch (error) {
        console.log('TRIGAS PDA: error guardando al salir', error);
        window.alert('No se pudieron guardar los seriales.');
    }
}

if (!window.__trigasTempSerialFrontendStarted) {
    window.__trigasTempSerialFrontendStarted = true;

    document.addEventListener('click', async (event) => {
        /*
            TRI3 Recogida Cliente usa su propio flujo nativo personalizado.
            No debe pasar por este validador viejo de contador 0/3.
        */
        if (document.body && (document.body.innerText || '').includes('WH/TRI3/')) {
            return;
        }

        if (!document.body || !document.body.classList.contains('trigas-barcode-operational-screen')) {
            return;
        }

        const button = event.target.closest('button, a');
        if (!button) {
            return;
        }

        const text = (button.innerText || button.textContent || '').trim().toLowerCase();

        if (text.includes('validar')) {
            await trigasTempHandleValidateButton(button);
            return;
        }

        const html = button.outerHTML || '';
        const isBack =
            html.includes('fa-arrow-left') ||
            html.includes('oi-arrow-left') ||
            button.className.toString().includes('back');

        if (isBack) {
            await trigasTempHandleBackButton(event);
        }
    }, true);
}


/* TRIGAS DEBUG - Exponer funciones temporales para prueba en consola */
try {
    if (typeof trigasTempAddSerial === 'function') {
        window.trigasTempAddSerial = trigasTempAddSerial;
    }
    if (typeof trigasTempGetSerials === 'function') {
        window.trigasTempGetSerials = trigasTempGetSerials;
    }
    if (typeof trigasTempRenderSerialList === 'function') {
        window.trigasTempRenderSerialList = trigasTempRenderSerialList;
    }
    if (typeof trigasTempSaveSerialsToBackend === 'function') {
        window.trigasTempSaveSerialsToBackend = trigasTempSaveSerialsToBackend;
    }

    console.log('TRIGAS TEMP FRONTEND DISPONIBLE');
} catch (error) {
    console.log('TRIGAS TEMP FRONTEND NO DISPONIBLE', error);
}


/* =========================================================
   TRIGAS PDA - Captura directa de escáner tipo teclado
   ========================================================= */

function trigasTempFindProductLineSafe() {
    const root = document.querySelector('.o_barcode_client_action');
    if (!root) {
        return false;
    }

    return (
        root.querySelector('.o_barcode_line') ||
        root.querySelector('.o_barcode_lines > div') ||
        root.querySelector('.o_barcode_lines')
    );
}

function trigasTempRenderSerialListSafe(forceExpanded = false) {
    if (!document.body || !document.body.classList.contains('trigas-barcode-operational-screen')) {
        return;
    }

    const productLine = trigasTempFindProductLineSafe();
    if (!productLine) {
        console.log('TRIGAS TEMP: no encontré línea de producto para pintar seriales');
        return;
    }

    const serials = window.trigasTempGetSerials ? window.trigasTempGetSerials() : trigasTempGetSerials();

    const expectedQty = trigasTempGetExpectedQty();

    if (typeof trigasTempUpdateCounter === 'function') {
        trigasTempUpdateCounter(serials.length);
    }

    const isComplete = !!expectedQty && serials.length >= expectedQty;

    productLine.classList.toggle('trigas-temp-complete', isComplete);

    console.log(
        'TRIGAS TEMP: render lista',
        'seriales=', serials.length,
        'esperado=', expectedQty,
        'completo=', isComplete
    );

    let serialBox = productLine.querySelector('.trigas-simple-serial-list');
    if (!serialBox) {
        serialBox = document.createElement('div');
        serialBox.className = 'trigas-simple-serial-list trigas-serial-collapsed';
        productLine.appendChild(serialBox);
    }

    const wasExpanded = forceExpanded || serialBox.classList.contains('trigas-serial-expanded');

    serialBox.innerHTML = '';

    if (!serials.length) {
        serialBox.style.display = 'none';
        return;
    }

    serialBox.style.display = 'block';
    serialBox.classList.toggle('trigas-serial-expanded', wasExpanded);
    serialBox.classList.toggle('trigas-serial-collapsed', !wasExpanded);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'trigas-simple-serial-toggle';
    toggle.innerHTML = `
        <span>Seriales escaneados (${serials.length})</span>
        <span class="trigas-simple-serial-arrow">${wasExpanded ? '▲' : '▼'}</span>
    `;

    toggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const expanded = serialBox.classList.toggle('trigas-serial-expanded');
        serialBox.classList.toggle('trigas-serial-collapsed', !expanded);

        const arrow = serialBox.querySelector('.trigas-simple-serial-arrow');
        if (arrow) {
            arrow.textContent = expanded ? '▲' : '▼';
        }
    });

    serialBox.appendChild(toggle);

    const list = document.createElement('div');
    list.className = 'trigas-simple-serial-items';

    serials.forEach((serial) => {
        const row = document.createElement('div');
        row.className = 'trigas-simple-serial-row';

        const serialText = document.createElement('span');
        serialText.className = 'trigas-simple-serial-name';
        serialText.textContent = serial;

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'trigas-simple-serial-delete';
        deleteButton.textContent = 'Borrar';

        deleteButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            const updated = trigasTempGetSerials().filter((s) => s !== serial);
            trigasTempSetSerials(updated);
            trigasTempRenderSerialListSafe(true);
        });

        row.appendChild(serialText);
        row.appendChild(deleteButton);
        list.appendChild(row);
    });

    serialBox.appendChild(list);
}


function trigasTempShowPdaMessage(message, type = 'error') {
    const root = document.querySelector('.o_barcode_client_action');
    if (!root) {
        window.alert(message);
        return;
    }

    let box = root.querySelector('.trigas-temp-pda-message');
    if (!box) {
        box = document.createElement('div');
        box.className = 'trigas-temp-pda-message';

        const productLine = root.querySelector('.o_barcode_line');
        if (productLine && productLine.parentNode) {
            productLine.parentNode.insertBefore(box, productLine);
        } else {
            root.prepend(box);
        }
    }

    box.classList.remove('trigas-temp-pda-message-error', 'trigas-temp-pda-message-success');
    box.classList.add(type === 'success' ? 'trigas-temp-pda-message-success' : 'trigas-temp-pda-message-error');
    box.textContent = message;
    box.style.display = 'block';

    clearTimeout(window.__trigasTempPdaMessageTimer);
    window.__trigasTempPdaMessageTimer = setTimeout(() => {
        box.style.display = 'none';
    }, 3500);
}

async function trigasTempValidateSerialInBackend(serialName) {
    const pickingId = trigasTempGetPickingId();
    if (!pickingId) {
        return {
            ok: false,
            message: 'No se pudo identificar el conduce actual.',
        };
    }

    const response = await fetch('/web/dataset/call_kw/stock.picking/trigas_barcode_validate_temp_serial_for_pda', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        credentials: 'same-origin',
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'call',
            params: {
                model: 'stock.picking',
                method: 'trigas_barcode_validate_temp_serial_for_pda',
                args: [[pickingId], serialName, trigasTempGetSerials()],
                kwargs: {},
            },
            id: Date.now(),
        }),
    });

    const data = await response.json();

    if (data.error) {
        return {
            ok: false,
            message: data.error.data && data.error.data.message ? data.error.data.message : 'Error validando serial.',
        };
    }

    return data.result || {
        ok: false,
        message: 'No se pudo validar el serial.',
    };
}

async function trigasTempAddSerialFromScanner(serialName) {
    if (!serialName) {
        return false;
    }

    serialName = String(serialName).trim();

    if (!serialName) {
        return false;
    }

    const serials = trigasTempGetSerials();

    if (serials.includes(serialName)) {
        trigasTempShowPdaMessage('El serial ' + serialName + ' ya fue leído.', 'error');
        trigasTempRenderSerialListSafe(true);
        return true;
    }

    const expectedQty = trigasTempGetExpectedQty();

    if (expectedQty && serials.length >= expectedQty) {
        trigasTempShowPdaMessage('Ya se leyó la cantidad completa esperada.', 'error');
        trigasTempRenderSerialListSafe(true);
        return true;
    }

    let validation = false;

    try {
        validation = await trigasTempValidateSerialInBackend(serialName);
    } catch (error) {
        console.log('TRIGAS TEMP: error validando serial', error);
        trigasTempShowPdaMessage('No se pudo validar el serial.', 'error');
        return false;
    }

    if (!validation.ok) {
        trigasTempShowPdaMessage(validation.message || 'Serial no válido para este conduce.', 'error');
        return false;
    }

    serials.push(serialName);
    trigasTempSetSerials(serials);
    trigasTempRenderSerialListSafe(true);

    if (expectedQty && serials.length >= expectedQty) {
        trigasTempShowPdaMessage('Cantidad completa leída.', 'success');
    }

    console.log('TRIGAS TEMP: serial agregado en frontend', serialName, serials);

    return true;
}


if (!window.__trigasKeyboardScannerCaptureStarted) {
    window.__trigasKeyboardScannerCaptureStarted = true;
    window.__trigasKeyboardScannerBuffer = '';
    window.__trigasKeyboardScannerLastKeyTime = 0;

    document.addEventListener('keydown', (event) => {
        if (!document.body || !document.body.classList.contains('trigas-barcode-operational-screen')) {
            return;
        }

        if (!document.querySelector('.o_barcode_client_action')) {
            return;
        }

        const now = Date.now();

        if (now - window.__trigasKeyboardScannerLastKeyTime > 600) {
            window.__trigasKeyboardScannerBuffer = '';
        }

        window.__trigasKeyboardScannerLastKeyTime = now;

        if (event.key === 'Enter') {
            const scanned = (window.__trigasKeyboardScannerBuffer || '').trim();
            window.__trigasKeyboardScannerBuffer = '';

            if (scanned) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();

                trigasTempHandleFinalScan(scanned);
            }

            return;
        }

        if (event.key && event.key.length === 1) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            window.__trigasKeyboardScannerBuffer += event.key;
        }
    }, true);
}

/* Exponer nueva función para prueba */

window.trigasTempValidateSerialInBackend = trigasTempValidateSerialInBackend;
window.trigasTempShowPdaMessage = trigasTempShowPdaMessage;
window.trigasTempAddSerialFromScanner = trigasTempAddSerialFromScanner;
window.trigasTempRenderSerialListSafe = trigasTempRenderSerialListSafe;

console.log('TRIGAS TEMP SCANNER CAPTURE DISPONIBLE');


/* TRIGAS TEMP - Override final: evitar que render viejo desde backend borre lista temporal */
try {
    if (typeof trigasRenderStandaloneSerialListForPda === 'function') {
        trigasRenderStandaloneSerialListForPda = async function () {
            if (typeof trigasTempRenderSerialListSafe === 'function') {
                trigasTempRenderSerialListSafe(true);
            }
            return typeof trigasTempGetSerials === 'function' ? trigasTempGetSerials() : [];
        };
        console.log('TRIGAS TEMP: render backend viejo neutralizado');
    }
} catch (error) {
    console.log('TRIGAS TEMP: no se pudo neutralizar render viejo', error);
}


/* =========================================================
   TRIGAS PDA - Flujo final:
   Seriales en frontend + lista plegada + ubicación destino obligatoria
   ========================================================= */

function trigasTempDestinationKey() {
    const pickingId = trigasTempGetPickingId();
    return pickingId ? 'trigas_destination_read_' + pickingId : false;
}

function trigasTempDestinationNameKey() {
    const pickingId = trigasTempGetPickingId();
    return pickingId ? 'trigas_destination_name_' + pickingId : false;
}

function trigasTempIsDestinationRead() {
    const key = trigasTempDestinationKey();
    return key ? window.sessionStorage.getItem(key) === '1' : false;
}

function trigasTempGetDestinationName() {
    const key = trigasTempDestinationNameKey();
    return key ? (window.sessionStorage.getItem(key) || '') : '';
}

function trigasTempSetDestinationName(name) {
    const key = trigasTempDestinationNameKey();
    if (!key) {
        return;
    }

    if (name) {
        window.sessionStorage.setItem(key, name);
    } else {
        window.sessionStorage.removeItem(key);
    }
}

function trigasTempSetDestinationRead(value) {
    const key = trigasTempDestinationKey();
    if (!key) {
        return;
    }

    if (value) {
        window.sessionStorage.setItem(key, '1');
    } else {
        window.sessionStorage.removeItem(key);
        trigasTempSetDestinationName('');
    }
}

function trigasTempSetValidateEnabled(enabled) {
    const bodyText = document.body ? (document.body.innerText || '') : '';

    // Este controlador general pertenece al Conduce 1.
    // En Conduce 2 el botón VALIDAR lo controla trigasC2FlowControlValidateButton.
    if (bodyText.includes('WH/TRI2/')) {
        return;
    }

    const root = document.querySelector('.o_barcode_client_action');
    if (!root) {
        return;
    }

    const buttons = [...root.querySelectorAll('button, .btn, a')];
    const validateButton = buttons.find((btn) => {
        const txt = (btn.innerText || btn.textContent || '').trim().toLowerCase();
        return txt.includes('validar');
    });

    if (!validateButton) {
        return;
    }

    validateButton.classList.toggle('trigas-validate-disabled', !enabled);
    validateButton.classList.toggle('trigas-validate-enabled', enabled);
}

function trigasTempRefreshValidateState() {
    const serials = trigasTempGetSerials();
    const expectedQty = trigasTempGetExpectedQty();
    const complete = !!expectedQty && serials.length >= expectedQty;
    const destinationRead = trigasTempIsDestinationRead();

    trigasTempSetValidateEnabled(complete && destinationRead);

    const productLine = document.querySelector('.o_barcode_client_action .o_barcode_line');
    if (productLine) {
        productLine.classList.toggle('trigas-temp-complete', complete);
    }

    return {
        complete,
        destinationRead,
        canValidate: complete && destinationRead,
    };
}

async function trigasTempValidateDestinationInBackend(scannedValue) {
    const pickingId = trigasTempGetPickingId();

    if (!pickingId) {
        return {
            ok: false,
            is_location: false,
            message: 'No se pudo identificar el conduce actual.',
        };
    }

    const response = await fetch('/web/dataset/call_kw/stock.picking/trigas_barcode_validate_destination_location_for_pda', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        credentials: 'same-origin',
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'call',
            params: {
                model: 'stock.picking',
                method: 'trigas_barcode_validate_destination_location_for_pda',
                args: [[pickingId], scannedValue],
                kwargs: {},
            },
            id: Date.now(),
        }),
    });

    const data = await response.json();

    if (data.error) {
        return {
            ok: false,
            is_location: false,
            message: data.error.data && data.error.data.message ? data.error.data.message : 'Error validando ubicación.',
        };
    }

    return data.result || {
        ok: false,
        is_location: false,
        message: 'No se pudo validar la ubicación.',
    };
}

function trigasTempRenderDestinationStatus() {
    const root = document.querySelector('.o_barcode_client_action');
    const productLine = document.querySelector('.o_barcode_client_action .o_barcode_line');

    if (!root || !productLine) {
        return;
    }

    let status = productLine.querySelector('.trigas-destination-status');

    if (!status) {
        status = document.createElement('div');
        status.className = 'trigas-destination-status';
        productLine.appendChild(status);
    }

    const state = trigasTempRefreshValidateState();

    if (state.destinationRead) {
        const destinationName = trigasTempGetDestinationName();
        status.textContent = destinationName
            ? ('Ubicación leída: ' + destinationName)
            : 'Ubicación leída';
        status.classList.add('trigas-destination-ok');
        status.classList.remove('trigas-destination-pending');
    } else {
        status.textContent = 'Pendiente leer ubicación destino';
        status.classList.add('trigas-destination-pending');
        status.classList.remove('trigas-destination-ok');
    }
}

/* Reemplazo final del render visual para que la lista quede plegada por defecto */
window.trigasTempRenderSerialListSafe = function (forceExpanded = false) {
    if (!document.body || !document.body.classList.contains('trigas-barcode-operational-screen')) {
        return;
    }

    const productLine = trigasTempFindProductLineSafe();
    if (!productLine) {
        return;
    }

    const serials = trigasTempGetSerials();

    if (typeof trigasTempUpdateCounter === 'function') {
        trigasTempUpdateCounter(serials.length);
    }

    const expectedQty = trigasTempGetExpectedQty();
    const isComplete = !!expectedQty && serials.length >= expectedQty;

    productLine.classList.toggle('trigas-temp-complete', isComplete);

    let serialBox = productLine.querySelector('.trigas-simple-serial-list');

    if (!serialBox) {
        serialBox = document.createElement('div');
        serialBox.className = 'trigas-simple-serial-list trigas-serial-collapsed';
        productLine.appendChild(serialBox);
    }

    const wasExpanded = forceExpanded || serialBox.classList.contains('trigas-serial-expanded');

    serialBox.innerHTML = '';

    if (!serials.length) {
        serialBox.style.display = 'none';
        trigasTempRenderDestinationStatus();
        trigasTempRefreshValidateState();
        return;
    }

    serialBox.style.display = 'block';

    // Importante: por defecto queda plegada cuando se lee un serial.
    serialBox.classList.toggle('trigas-serial-expanded', wasExpanded);
    serialBox.classList.toggle('trigas-serial-collapsed', !wasExpanded);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'trigas-simple-serial-toggle';
    toggle.innerHTML = `
        <span>Seriales escaneados (${serials.length})</span>
        <span class="trigas-simple-serial-arrow">${wasExpanded ? '▲' : '▼'}</span>
    `;

    toggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const expanded = serialBox.classList.toggle('trigas-serial-expanded');
        serialBox.classList.toggle('trigas-serial-collapsed', !expanded);

        const arrow = serialBox.querySelector('.trigas-simple-serial-arrow');
        if (arrow) {
            arrow.textContent = expanded ? '▲' : '▼';
        }
    });

    serialBox.appendChild(toggle);

    const list = document.createElement('div');
    list.className = 'trigas-simple-serial-items';

    serials.forEach((serial) => {
        const row = document.createElement('div');
        row.className = 'trigas-simple-serial-row';

        const serialText = document.createElement('span');
        serialText.className = 'trigas-simple-serial-name';
        serialText.textContent = serial;

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'trigas-simple-serial-delete';
        deleteButton.textContent = 'Borrar';

        deleteButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            const updated = trigasTempGetSerials().filter((s) => s !== serial);
            trigasTempSetSerials(updated);

            if (updated.length < trigasTempGetExpectedQty()) {
                trigasTempSetDestinationRead(false);
            }

            window.trigasTempRenderSerialListSafe(true);
        });

        row.appendChild(serialText);
        row.appendChild(deleteButton);
        list.appendChild(row);
    });

    serialBox.appendChild(list);

    trigasTempRenderDestinationStatus();
    trigasTempRefreshValidateState();

    console.log(
        'TRIGAS TEMP FINAL:',
        'seriales=', serials.length,
        'esperado=', expectedQty,
        'destino=', trigasTempIsDestinationRead()
    );
};

async function trigasTempHandleFinalScan(scannedValue) {
    scannedValue = String(scannedValue || '').trim();

    if (!scannedValue) {
        return false;
    }

    // Si ya completó cantidad, lo próximo que esperamos es ubicación destino.
    const serials = trigasTempGetSerials();
    const expectedQty = trigasTempGetExpectedQty();
    const complete = !!expectedQty && serials.length >= expectedQty;

    if (complete && !trigasTempIsDestinationRead()) {
        const destinationValidation = await trigasTempValidateDestinationInBackend(scannedValue);

        if (destinationValidation.ok && destinationValidation.is_location) {
            trigasTempSetDestinationRead(true);
            trigasTempShowPdaMessage(destinationValidation.message || 'Ubicación destino confirmada.', 'success');
            window.trigasTempRenderSerialListSafe(false);
            return true;
        }

        // Si ya está completo y lee otra cosa que no es ubicación, mostramos error.
        trigasTempSetDestinationRead(false);
        trigasTempShowPdaMessage(
            destinationValidation.message || ('No es una ubicación de camión: ' + scannedValue),
            'error'
        );
        window.trigasTempRenderSerialListSafe(false);
        trigasTempRefreshValidateState();
        return false;
    }

    // Antes de completar, todo lo que lee se trata como serial.
    await trigasTempAddSerialFromScanner(scannedValue);

    // La lista debe quedar plegada luego de cada lectura.
    window.trigasTempRenderSerialListSafe(false);

    return true;
}

/* Validación final: no permitir validar sin cantidad completa + ubicación destino */
window.trigasTempCanValidateNow = function () {
    const state = trigasTempRefreshValidateState();
    return state.canValidate;
};

console.log('TRIGAS TEMP FINAL FLOW DISPONIBLE');


/* TRIGAS PDA - Bloquear validar hasta completar seriales + ubicación destino */
if (!window.__trigasFinalValidateBlockStarted) {
    window.__trigasFinalValidateBlockStarted = true;

    document.addEventListener('click', async (event) => {
        /*
            TRI3 Recogida Cliente tiene su propio flujo:
            seriales abiertos + ubicación camión + firma + validación directa.
            No debe usar el validador viejo de contador 0/3.
        */
        if (
            window.location.href.includes('WH/TRI3/') ||
            window.location.hash.includes('active_id=') && document.body && (document.body.innerText || '').includes('WH/TRI3/')
        ) {
            return;
        }

        if (!document.body || !document.body.classList.contains('trigas-barcode-operational-screen')) {
            return;
        }

        const button = event.target.closest('button, a, .btn');

        if (!button) {
            return;
        }

        const txt = (button.innerText || button.textContent || '').trim().toLowerCase();

        if (!txt.includes('validar')) {
            return;
        }

        if (window.__trigasAllowValidateAfterTempSave) {
            return;
        }

        if (!window.trigasTempCanValidateNow || !window.trigasTempCanValidateNow()) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            const serials = trigasTempGetSerials();
            const expectedQty = trigasTempGetExpectedQty();

            if (expectedQty && serials.length < expectedQty) {
                trigasTempShowPdaMessage('Faltan seriales por leer: ' + serials.length + ' / ' + expectedQty, 'error');
                return;
            }

            if (!trigasTempIsDestinationRead()) {
                trigasTempShowPdaMessage('Primero debe leer la ubicación destino del camión.', 'error');
                return;
            }

            trigasTempShowPdaMessage('No se puede validar todavía.', 'error');
            return;
        }
    }, true);
}


/* =========================================================
   TRIGAS PDA - PARCHE FINAL DE FLUJO OPERATIVO
   - Lista plegada por defecto
   - Contador visual correcto
   - Detectar ubicación destino ya mostrada por Odoo
   - Habilitar validar solo con seriales completos + ubicación destino
   ========================================================= */

function trigasFinalGetProductLine() {
    return (
        document.querySelector('.o_barcode_client_action .o_barcode_line') ||
        document.querySelector('.o_barcode_client_action .o_barcode_lines > div') ||
        document.querySelector('.o_barcode_client_action .o_barcode_lines')
    );
}

function trigasFinalGetExpectedQtyFromScreen() {
    const root = document.querySelector('.o_barcode_client_action');
    if (!root) {
        return 0;
    }

    const text = root.innerText || '';
    const match = text.match(/(\d+)\s*\/\s*(\d+)/);

    if (match && match[2]) {
        return Number(match[2]);
    }

    return 0;
}

function trigasFinalUpdateCounter(serialCount) {
    const root = document.querySelector('.o_barcode_client_action');
    if (!root) {
        return;
    }

    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                const txt = (node.nodeValue || '').trim();
                return /^\d+\s*\/\s*\d+$/.test(txt)
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
            }
        }
    );

    const node = walker.nextNode();
    if (!node) {
        return;
    }

    const current = (node.nodeValue || '').trim();
    const parts = current.split('/').map((p) => p.trim());

    if (parts.length === 2) {
        node.nodeValue = serialCount + ' / ' + parts[1];
    }
}

function trigasFinalFindDisplayedDestinationName() {
    const root = document.querySelector('.o_barcode_client_action');
    if (!root) {
        return '';
    }

    const text = root.innerText || '';
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

    const destinationLine = lines.find((line) => {
        return (
            line.includes('/Camion') ||
            line.includes('/Camión') ||
            line.toLowerCase().includes('camion') ||
            line.toLowerCase().includes('camión')
        );
    });

    return destinationLine || '';
}

function trigasFinalDetectDestinationReadFromScreen() {
    /*
       IMPORTANTE:
       Antes esta función intentaba detectar la ubicación leyendo texto de pantalla.
       Eso provocaba falsos positivos: si Odoo mostraba un mensaje con una ubicación
       incorrecta, se guardaba trigas_destination_read_<id> = 1.

       Regla nueva:
       La ubicación solo puede quedar como leída cuando el backend responde ok === true.
       Esta función solo consulta sessionStorage, no escribe nada.
    */
    return trigasTempIsDestinationRead();
}

function trigasFinalSetValidateButtonState(enabled) {
    const bodyText = document.body ? (document.body.innerText || '') : '';

    // Este controlador general pertenece al Conduce 1.
    // En Conduce 2 el botón VALIDAR lo controla trigasC2FlowControlValidateButton.
    if (bodyText.includes('WH/TRI2/')) {
        return;
    }

    const root = document.querySelector('.o_barcode_client_action');
    if (!root) {
        return;
    }

    const buttons = [...root.querySelectorAll('button, a, .btn')];

    const validateButton = buttons.find((btn) => {
        const txt = (btn.innerText || btn.textContent || '').trim().toLowerCase();
        return txt.includes('validar');
    });

    if (!validateButton) {
        return;
    }

    validateButton.classList.toggle('trigas-validate-disabled', !enabled);
    validateButton.classList.toggle('trigas-validate-enabled', enabled);

    validateButton.style.pointerEvents = enabled ? 'auto' : 'auto';
}

function trigasFinalRefreshState() {
    const serials = trigasTempGetSerials();
    const expectedQty = trigasFinalGetExpectedQtyFromScreen() || trigasTempGetExpectedQty();
    const isComplete = !!expectedQty && serials.length >= expectedQty;
    const destinationRead = trigasFinalDetectDestinationReadFromScreen();

    const productLine = trigasFinalGetProductLine();

    if (productLine) {
        productLine.classList.toggle('trigas-temp-complete', isComplete);
    }

    trigasFinalUpdateCounter(serials.length);
    trigasFinalSetValidateButtonState(isComplete && destinationRead);

    return {
        serials,
        expectedQty,
        isComplete,
        destinationRead,
        canValidate: isComplete && destinationRead,
    };
}

function trigasFinalGetDestinationNameForDisplay() {
    let destinationName = '';

    if (typeof trigasTempGetDestinationName === 'function') {
        destinationName = trigasTempGetDestinationName();
    }

    if (!destinationName) {
        const successMessage = document.querySelector('.trigas-temp-pda-message-success');
        const messageText = successMessage ? (successMessage.innerText || successMessage.textContent || '').trim() : '';

        if (messageText) {
            destinationName = messageText
                .replace('Ubicación destino confirmada:', '')
                .replace('Ubicacion destino confirmada:', '')
                .replace('Ubicación leída:', '')
                .replace('Ubicacion leida:', '')
                .trim();

            if (destinationName && typeof trigasTempSetDestinationName === 'function') {
                trigasTempSetDestinationName(destinationName);
            }
        }
    }

    return destinationName;
}

function trigasFinalRenderDestinationStatus() {
    const productLine = trigasFinalGetProductLine();

    if (!productLine) {
        return;
    }

    let status = productLine.querySelector('.trigas-destination-status');

    if (!status) {
        status = document.createElement('div');
        status.className = 'trigas-destination-status';
        productLine.appendChild(status);
    }

    const state = trigasFinalRefreshState();

    if (state.destinationRead) {
        const destinationName = trigasTempGetDestinationName();
        status.textContent = destinationName
            ? ('Ubicación leída: ' + destinationName)
            : 'Ubicación leída';
        status.classList.add('trigas-destination-ok');
        status.classList.remove('trigas-destination-pending');
    } else {
        status.textContent = 'Pendiente leer ubicación destino';
        status.classList.add('trigas-destination-pending');
        status.classList.remove('trigas-destination-ok');
    }
}

window.trigasTempRenderSerialListSafe = function (forceExpanded = false) {
    if (!document.body || !document.body.classList.contains('trigas-barcode-operational-screen')) {
        return;
    }

    const productLine = trigasFinalGetProductLine();

    if (!productLine) {
        return;
    }

    const serials = trigasTempGetSerials();

    trigasFinalUpdateCounter(serials.length);

    let serialBox = productLine.querySelector('.trigas-simple-serial-list');

    if (!serialBox) {
        serialBox = document.createElement('div');
        serialBox.className = 'trigas-simple-serial-list trigas-serial-collapsed';
        productLine.appendChild(serialBox);
    }

    /*
       IMPORTANTE:
       forceExpanded solo se usa cuando el usuario toca el desplegable.
       Cuando se lee un serial, la lista debe quedar plegada.
    */
    const wasExpanded = !!forceExpanded && serialBox.classList.contains('trigas-serial-expanded');

    serialBox.innerHTML = '';

    if (!serials.length) {
        serialBox.style.display = 'none';
        trigasFinalRenderDestinationStatus();
        trigasFinalRefreshState();
        return;
    }

    serialBox.style.display = 'block';
    serialBox.classList.remove('trigas-serial-expanded');
    serialBox.classList.add('trigas-serial-collapsed');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'trigas-simple-serial-toggle';
    toggle.innerHTML = `
        <span>Seriales escaneados (${serials.length})</span>
        <span class="trigas-simple-serial-arrow">▼</span>
    `;

    toggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const expanded = serialBox.classList.toggle('trigas-serial-expanded');
        serialBox.classList.toggle('trigas-serial-collapsed', !expanded);

        const arrow = serialBox.querySelector('.trigas-simple-serial-arrow');

        if (arrow) {
            arrow.textContent = expanded ? '▲' : '▼';
        }
    });

    serialBox.appendChild(toggle);

    const list = document.createElement('div');
    list.className = 'trigas-simple-serial-items';

    serials.forEach((serial) => {
        const row = document.createElement('div');
        row.className = 'trigas-simple-serial-row';

        const serialText = document.createElement('span');
        serialText.className = 'trigas-simple-serial-name';
        serialText.textContent = serial;

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'trigas-simple-serial-delete';
        deleteButton.textContent = 'Borrar';

        deleteButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            const updated = trigasTempGetSerials().filter((s) => s !== serial);
            trigasTempSetSerials(updated);
            trigasTempSetDestinationRead(false);

            window.trigasTempRenderSerialListSafe(false);
        });

        row.appendChild(serialText);
        row.appendChild(deleteButton);
        list.appendChild(row);
    });

    serialBox.appendChild(list);

    trigasFinalRenderDestinationStatus();
    trigasFinalRefreshState();

    console.log('TRIGAS FINAL STATE', trigasFinalRefreshState());
};

async function trigasFinalHandleScan(scannedValue) {
    scannedValue = String(scannedValue || '').trim();

    if (!scannedValue) {
        return false;
    }

    const stateBefore = trigasFinalRefreshState();

    if (stateBefore.isComplete && !stateBefore.destinationRead) {
        const validation = await trigasTempValidateDestinationInBackend(scannedValue);

        if (validation.ok && validation.is_location) {
            const destinationName = validation.location_name || validation.destination_name || '';
            trigasTempSetDestinationRead(true);
            trigasTempSetDestinationName(destinationName);
            trigasTempShowPdaMessage(
                destinationName ? ('Ubicación leída: ' + destinationName) : 'Ubicación destino confirmada.',
                'success'
            );
            window.trigasTempRenderSerialListSafe(false);
            trigasFinalRefreshState();
            return true;
        }

        trigasTempSetDestinationRead(false);
        trigasTempShowPdaMessage(
            validation.message || ('No es una ubicación de camión: ' + scannedValue),
            'error'
        );
        window.trigasTempRenderSerialListSafe(false);
        trigasFinalRefreshState();
        return false;
    }

    if (!stateBefore.isComplete) {
        await trigasTempAddSerialFromScanner(scannedValue);

        /*
           Después de leer serial, forzamos lista plegada.
           El contador se actualiza según la lista temporal.
        */
        window.trigasTempRenderSerialListSafe(false);
        trigasFinalRefreshState();
        return true;
    }

    trigasTempShowPdaMessage('Ya se completaron los seriales. Lea la ubicación destino.', 'error');
    return false;
}

window.trigasTempCanValidateNow = function () {
    return trigasFinalRefreshState().canValidate;
};

/* Reemplazar listener anterior sin duplicarlo */
if (!window.__trigasFinalScannerPatchStarted) {
    window.__trigasFinalScannerPatchStarted = true;

    document.addEventListener('keydown', (event) => {
        if (!document.body || !document.body.classList.contains('trigas-barcode-operational-screen')) {
            return;
        }

        if (!document.querySelector('.o_barcode_client_action')) {
            return;
        }

        const now = Date.now();

        if (!window.__trigasFinalScannerBuffer) {
            window.__trigasFinalScannerBuffer = '';
        }

        if (!window.__trigasFinalScannerLastKeyTime) {
            window.__trigasFinalScannerLastKeyTime = 0;
        }

        if (now - window.__trigasFinalScannerLastKeyTime > 600) {
            window.__trigasFinalScannerBuffer = '';
        }

        window.__trigasFinalScannerLastKeyTime = now;

        if (event.key === 'Enter') {
            const scanned = (window.__trigasFinalScannerBuffer || '').trim();
            window.__trigasFinalScannerBuffer = '';

            if (scanned) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();

                trigasFinalHandleScan(scanned);
            }

            return;
        }

        if (event.key && event.key.length === 1) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            window.__trigasFinalScannerBuffer += event.key;
        }
    }, true);

    setInterval(() => {
        if (
            document.body &&
            document.body.classList.contains('trigas-barcode-operational-screen') &&
            document.querySelector('.o_barcode_client_action')
        ) {
            trigasFinalRefreshState();
        }
    }, 700);

    console.log('TRIGAS FINAL SCANNER PATCH ACTIVO');
}


/* =========================================================
   TRIGAS PDA - Corrección fuerte del contador 0 / 3
   Soporta contador separado en varios nodos HTML.
   ========================================================= */

function trigasFinalUpdateCounterStrong(serialCount) {
    const productLine = trigasFinalGetProductLine
        ? trigasFinalGetProductLine()
        : document.querySelector('.o_barcode_client_action .o_barcode_line');

    if (!productLine) {
        return;
    }

    const serialBox = productLine.querySelector('.trigas-simple-serial-list');
    const statusBox = productLine.querySelector('.trigas-destination-status');

    const isInsideTrigasCustomBox = (node) => {
        if (!node || !node.parentElement) {
            return false;
        }

        return (
            (serialBox && serialBox.contains(node.parentElement)) ||
            (statusBox && statusBox.contains(node.parentElement))
        );
    };

    const textNodes = [];

    const walker = document.createTreeWalker(
        productLine,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                if (isInsideTrigasCustomBox(node)) {
                    return NodeFilter.FILTER_REJECT;
                }

                const txt = (node.nodeValue || '').trim();

                if (!txt) {
                    return NodeFilter.FILTER_REJECT;
                }

                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    let node;
    while ((node = walker.nextNode())) {
        textNodes.push(node);
    }

    // Caso 1: el contador está en un solo texto: "0 / 3"
    for (const textNode of textNodes) {
        const txt = (textNode.nodeValue || '').trim();

        if (/^\d+\s*\/\s*\d+$/.test(txt)) {
            const parts = txt.split('/').map((p) => p.trim());
            textNode.nodeValue = serialCount + ' / ' + parts[1];
            return;
        }
    }

    // Caso 2: el contador está separado: "0", "/", "3"
    for (let i = 0; i < textNodes.length; i++) {
        const txt = (textNodes[i].nodeValue || '').trim();

        if (txt === '/') {
            let prevNode = null;
            let nextNode = null;

            for (let p = i - 1; p >= 0; p--) {
                const prevTxt = (textNodes[p].nodeValue || '').trim();
                if (/^\d+$/.test(prevTxt)) {
                    prevNode = textNodes[p];
                    break;
                }
            }

            for (let n = i + 1; n < textNodes.length; n++) {
                const nextTxt = (textNodes[n].nodeValue || '').trim();
                if (/^\d+$/.test(nextTxt)) {
                    nextNode = textNodes[n];
                    break;
                }
            }

            if (prevNode && nextNode) {
                prevNode.nodeValue = String(serialCount);
                return;
            }
        }
    }

    // Caso 3: fallback visual propio si Odoo no deja tocar su contador.
    let customCounter = productLine.querySelector('.trigas-temp-counter-override');

    if (!customCounter) {
        customCounter = document.createElement('div');
        customCounter.className = 'trigas-temp-counter-override';

        const reference = productLine.querySelector('.trigas-simple-serial-list');

        if (reference) {
            productLine.insertBefore(customCounter, reference);
        } else {
            productLine.appendChild(customCounter);
        }
    }

    const expectedQty = trigasFinalGetExpectedQtyFromScreen
        ? trigasFinalGetExpectedQtyFromScreen()
        : trigasTempGetExpectedQty();

    customCounter.textContent = serialCount + ' / ' + expectedQty;
}

/* Sobrescribimos las funciones anteriores para que todas usen la fuerte */
trigasFinalUpdateCounter = trigasFinalUpdateCounterStrong;
trigasTempUpdateCounter = trigasFinalUpdateCounterStrong;

console.log('TRIGAS PDA: contador fuerte activo');


/* =========================================================
   TRIGAS PDA - Corrección definitiva del contador 0 / 3
   Evita confundir WH/TRI1/00010 con cantidades.
   ========================================================= */

function trigasCounterGetExpectedKey() {
    const pickingId = trigasTempGetPickingId ? trigasTempGetPickingId() : false;
    return pickingId ? 'trigas_expected_qty_' + pickingId : false;
}

function trigasCounterRememberExpected(qty) {
    const key = trigasCounterGetExpectedKey();
    if (key && qty) {
        window.sessionStorage.setItem(key, String(qty));
    }
}

function trigasCounterGetRememberedExpected() {
    const key = trigasCounterGetExpectedKey();
    if (!key) {
        return 0;
    }

    return Number(window.sessionStorage.getItem(key) || 0);
}

function trigasCounterFindNativeCounter() {
    const productLine = trigasFinalGetProductLine
        ? trigasFinalGetProductLine()
        : document.querySelector('.o_barcode_client_action .o_barcode_line');

    if (!productLine) {
        return false;
    }

    const customBoxes = [
        '.trigas-simple-serial-list',
        '.trigas-destination-status',
        '.trigas-temp-counter-override',
        '.trigas-temp-pda-message',
    ];

    const isInsideCustomBox = (node) => {
        if (!node || !node.parentElement) {
            return false;
        }

        return customBoxes.some((selector) => {
            const box = productLine.querySelector(selector);
            return box && box.contains(node.parentElement);
        });
    };

    const textNodes = [];

    const walker = document.createTreeWalker(
        productLine,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                if (isInsideCustomBox(node)) {
                    return NodeFilter.FILTER_REJECT;
                }

                const txt = (node.nodeValue || '').trim();

                if (!txt) {
                    return NodeFilter.FILTER_REJECT;
                }

                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    let node;
    while ((node = walker.nextNode())) {
        textNodes.push(node);
    }

    // Caso 1: contador en un mismo texto: "0 / 3"
    // Importante: no acepta cosas pegadas a letras como WH/TRI1/00010.
    for (const textNode of textNodes) {
        const txt = textNode.nodeValue || '';
        const match = txt.match(/(^|[^A-Za-z0-9])(\d+)\s*\/\s*(\d+)(?=$|[^A-Za-z0-9])/);

        if (match) {
            const total = Number(match[3]);
            if (total > 0 && total < 10000) {
                trigasCounterRememberExpected(total);
                return {
                    mode: 'single',
                    node: textNode,
                    total: total,
                    matchText: match[0],
                };
            }
        }
    }

    // Caso 2: contador separado: "0", "/", "3"
    for (let i = 0; i < textNodes.length; i++) {
        const txt = (textNodes[i].nodeValue || '').trim();

        if (txt === '/') {
            let prevNode = false;
            let nextNode = false;

            for (let p = i - 1; p >= 0; p--) {
                const prevTxt = (textNodes[p].nodeValue || '').trim();
                if (/^\d+$/.test(prevTxt)) {
                    prevNode = textNodes[p];
                    break;
                }
            }

            for (let n = i + 1; n < textNodes.length; n++) {
                const nextTxt = (textNodes[n].nodeValue || '').trim();
                if (/^\d+$/.test(nextTxt)) {
                    nextNode = textNodes[n];
                    break;
                }
            }

            if (prevNode && nextNode) {
                const total = Number((nextNode.nodeValue || '').trim());
                if (total > 0 && total < 10000) {
                    trigasCounterRememberExpected(total);
                    return {
                        mode: 'split',
                        currentNode: prevNode,
                        totalNode: nextNode,
                        total: total,
                    };
                }
            }
        }
    }

    return false;
}

function trigasFinalGetExpectedQtyFromScreenStrong() {
    const nativeCounter = trigasCounterFindNativeCounter();

    if (nativeCounter && nativeCounter.total) {
        return nativeCounter.total;
    }

    return trigasCounterGetRememberedExpected();
}

function trigasFinalUpdateCounterReallyStrong(serialCount) {
    const productLine = trigasFinalGetProductLine
        ? trigasFinalGetProductLine()
        : document.querySelector('.o_barcode_client_action .o_barcode_line');

    if (!productLine) {
        return;
    }

    const nativeCounter = trigasCounterFindNativeCounter();

    // Quitar contador de respaldo viejo incorrecto, si existe.
    const oldCustomCounter = productLine.querySelector('.trigas-temp-counter-override');
    if (oldCustomCounter) {
        oldCustomCounter.remove();
    }

    if (nativeCounter) {
        if (nativeCounter.mode === 'single') {
            const original = nativeCounter.node.nodeValue || '';
            nativeCounter.node.nodeValue = original.replace(
                /(^|[^A-Za-z0-9])(\d+)\s*\/\s*(\d+)(?=$|[^A-Za-z0-9])/,
                '$1' + serialCount + ' / ' + nativeCounter.total
            );
            return;
        }

        if (nativeCounter.mode === 'split' && nativeCounter.currentNode) {
            nativeCounter.currentNode.nodeValue = String(serialCount);
            return;
        }
    }

    // Fallback solo si de verdad no encontramos el contador nativo.
    const expectedQty = trigasCounterGetRememberedExpected();

    if (!expectedQty) {
        return;
    }

    let customCounter = productLine.querySelector('.trigas-temp-counter-override');

    if (!customCounter) {
        customCounter = document.createElement('div');
        customCounter.className = 'trigas-temp-counter-override';

        const serialBox = productLine.querySelector('.trigas-simple-serial-list');

        if (serialBox) {
            productLine.insertBefore(customCounter, serialBox);
        } else {
            productLine.appendChild(customCounter);
        }
    }

    customCounter.textContent = serialCount + ' / ' + expectedQty;
}

// Sobrescribir funciones anteriores con la versión correcta.
trigasFinalGetExpectedQtyFromScreen = trigasFinalGetExpectedQtyFromScreenStrong;
trigasFinalUpdateCounter = trigasFinalUpdateCounterReallyStrong;
trigasTempUpdateCounter = trigasFinalUpdateCounterReallyStrong;

// Recalcular al cargar.
setTimeout(() => {
    try {
        trigasCounterFindNativeCounter();
        trigasFinalUpdateCounterReallyStrong(trigasTempGetSerials().length);
        if (window.trigasTempRenderSerialListSafe) {
            window.trigasTempRenderSerialListSafe(false);
        }
    } catch (error) {
        console.log('TRIGAS PDA: error actualizando contador fuerte', error);
    }
}, 800);

console.log('TRIGAS PDA: contador 0/3 corregido sin confundir WH/TRI1/00010');


/* =========================================================
   TRIGAS PDA - Contador propio estable
   ========================================================= */

function trigasPdaExpectedQtyKey() {
    const pickingId = trigasTempGetPickingId ? trigasTempGetPickingId() : false;
    return pickingId ? 'trigas_pda_expected_qty_' + pickingId : false;
}

function trigasPdaSetExpectedQty(qty) {
    const key = trigasPdaExpectedQtyKey();
    if (key && qty) {
        window.sessionStorage.setItem(key, String(qty));
    }
}

function trigasPdaGetExpectedQtyStored() {
    const key = trigasPdaExpectedQtyKey();
    if (!key) {
        return 0;
    }
    return Number(window.sessionStorage.getItem(key) || 0);
}

async function trigasPdaLoadExpectedQty() {
    const pickingId = trigasTempGetPickingId ? trigasTempGetPickingId() : false;

    if (!pickingId) {
        return 0;
    }

    try {
        const response = await fetch('/web/dataset/call_kw/stock.picking/trigas_barcode_get_pda_expected_qty', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials: 'same-origin',
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'call',
                params: {
                    model: 'stock.picking',
                    method: 'trigas_barcode_get_pda_expected_qty',
                    args: [[pickingId]],
                    kwargs: {},
                },
                id: Date.now(),
            }),
        });

        const data = await response.json();
        const result = data.result || {};
        const qty = Number(result.expected_qty || 0);

        if (qty) {
            trigasPdaSetExpectedQty(qty);
        }

        return qty;
    } catch (error) {
        console.log('TRIGAS PDA: error cargando cantidad esperada', error);
        return trigasPdaGetExpectedQtyStored();
    }
}

function trigasPdaGetExpectedQty() {
    return trigasPdaGetExpectedQtyStored();
}

function trigasPdaRenderOwnCounter() {
    const productLine = trigasFinalGetProductLine
        ? trigasFinalGetProductLine()
        : document.querySelector('.o_barcode_client_action .o_barcode_line');

    if (!productLine) {
        return;
    }

    const serials = trigasTempGetSerials ? trigasTempGetSerials() : [];
    const expectedQty = trigasPdaGetExpectedQty();

    let counter = productLine.querySelector('.trigas-pda-own-counter');

    if (!counter) {
        counter = document.createElement('div');
        counter.className = 'trigas-pda-own-counter';

        const serialBox = productLine.querySelector('.trigas-simple-serial-list');

        if (serialBox) {
            productLine.insertBefore(counter, serialBox);
        } else {
            productLine.appendChild(counter);
        }
    }

    counter.textContent = 'Leídos: ' + serials.length + ' / ' + (expectedQty || '?');

    const isComplete = !!expectedQty && serials.length >= expectedQty;

    productLine.classList.toggle('trigas-temp-complete', isComplete);

    return {
        serials: serials,
        expectedQty: expectedQty,
        isComplete: isComplete,
    };
}

/* Override final: la cantidad esperada viene del backend, no del texto 0/3 de Odoo */
trigasFinalGetExpectedQtyFromScreen = function () {
    return trigasPdaGetExpectedQty();
};

trigasTempGetExpectedQty = function () {
    return trigasPdaGetExpectedQty();
};

trigasFinalUpdateCounter = function () {
    trigasPdaRenderOwnCounter();
};

trigasTempUpdateCounter = function () {
    trigasPdaRenderOwnCounter();
};

/* Reforzar render de lista para incluir contador propio */
const trigasOriginalRenderListSafeFinal = window.trigasTempRenderSerialListSafe;

window.trigasTempRenderSerialListSafe = function (forceExpanded = false) {
    if (typeof trigasOriginalRenderListSafeFinal === 'function') {
        trigasOriginalRenderListSafeFinal(forceExpanded);
    }

    trigasPdaRenderOwnCounter();

    if (typeof trigasFinalRefreshState === 'function') {
        trigasFinalRefreshState();
    }
};

/* Cargar cantidad esperada al entrar */
setTimeout(async () => {
    await trigasPdaLoadExpectedQty();
    trigasPdaRenderOwnCounter();

    if (window.trigasTempRenderSerialListSafe) {
        window.trigasTempRenderSerialListSafe(false);
    }
}, 600);

console.log('TRIGAS PDA: contador propio estable activo');


/* =========================================================
   TRIGAS PDA - FIX DEFINITIVO expected_qty desde backend
   ========================================================= */

function trigasFixedGetPickingId() {
    const hash = window.location.hash || '';
    const match = hash.match(/active_id=(\d+)/);
    return match && match[1] ? Number(match[1]) : false;
}

function trigasFixedExpectedKey() {
    const pickingId = trigasFixedGetPickingId();
    return pickingId ? 'trigas_fixed_expected_qty_' + pickingId : false;
}

function trigasFixedSetExpectedQty(qty) {
    const key = trigasFixedExpectedKey();
    if (key && qty) {
        window.sessionStorage.setItem(key, String(qty));
    }
}

function trigasFixedGetExpectedQty() {
    const key = trigasFixedExpectedKey();
    if (!key) {
        return 0;
    }
    return Number(window.sessionStorage.getItem(key) || 0);
}

async function trigasFixedLoadExpectedQty() {
    const pickingId = trigasFixedGetPickingId();

    if (!pickingId) {
        console.log('TRIGAS FIXED: no active_id para expected qty');
        return 0;
    }

    try {
        const response = await fetch('/web/dataset/call_kw/stock.picking/trigas_barcode_get_pda_expected_qty', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials: 'same-origin',
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'call',
                params: {
                    model: 'stock.picking',
                    method: 'trigas_barcode_get_pda_expected_qty',
                    args: [[pickingId]],
                    kwargs: {},
                },
                id: Date.now(),
            }),
        });

        const data = await response.json();
        const result = data.result || {};
        const qty = Number(result.expected_qty || 0);

        console.log('TRIGAS FIXED expected qty:', result);

        if (qty) {
            trigasFixedSetExpectedQty(qty);
        }

        return qty;
    } catch (error) {
        console.log('TRIGAS FIXED: error cargando expected qty', error);
        return 0;
    }
}

function trigasFixedGetProductLine() {
    return (
        document.querySelector('.o_barcode_client_action .o_barcode_line') ||
        document.querySelector('.o_barcode_client_action .o_barcode_lines > div') ||
        document.querySelector('.o_barcode_client_action .o_barcode_lines')
    );
}

function trigasFixedHideNativeOdooCounter() {
    const productLine = trigasFixedGetProductLine();

    if (!productLine) {
        return;
    }

    const walker = document.createTreeWalker(
        productLine,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                const parent = node.parentElement;

                if (!parent) {
                    return NodeFilter.FILTER_REJECT;
                }

                if (
                    parent.closest('.trigas-pda-own-counter') ||
                    parent.closest('.trigas-simple-serial-list') ||
                    parent.closest('.trigas-destination-status') ||
                    parent.closest('.trigas-temp-pda-message')
                ) {
                    return NodeFilter.FILTER_REJECT;
                }

                const txt = (node.nodeValue || '').trim();

                if (/^\d+\s*\/\s*\d+$/.test(txt)) {
                    return NodeFilter.FILTER_ACCEPT;
                }

                return NodeFilter.FILTER_REJECT;
            }
        }
    );

    let node;
    while ((node = walker.nextNode())) {
        if (node.parentElement) {
            node.parentElement.classList.add('trigas-hide-native-counter');
        }
    }
}

function trigasFixedRenderCounter() {
    const productLine = trigasFixedGetProductLine();

    if (!productLine) {
        return;
    }

    const serials = typeof trigasTempGetSerials === 'function' ? trigasTempGetSerials() : [];
    const expectedQty = trigasFixedGetExpectedQty();

    let counter = productLine.querySelector('.trigas-pda-own-counter');

    if (!counter) {
        counter = document.createElement('div');
        counter.className = 'trigas-pda-own-counter';

        const serialBox = productLine.querySelector('.trigas-simple-serial-list');
        const destinationBox = productLine.querySelector('.trigas-destination-status');

        if (serialBox) {
            productLine.insertBefore(counter, serialBox);
        } else if (destinationBox) {
            productLine.insertBefore(counter, destinationBox);
        } else {
            productLine.appendChild(counter);
        }
    }

    counter.textContent = 'Leídos: ' + serials.length + ' / ' + (expectedQty || 'cargando...');

    const complete = !!expectedQty && serials.length >= expectedQty;
    productLine.classList.toggle('trigas-temp-complete', complete);

    trigasFixedHideNativeOdooCounter();

    return {
        serials,
        expectedQty,
        complete,
    };
}

/* Sobrescribir expected qty para todo el flujo */
trigasFinalGetExpectedQtyFromScreen = function () {
    return trigasFixedGetExpectedQty();
};

trigasTempGetExpectedQty = function () {
    return trigasFixedGetExpectedQty();
};

trigasFinalUpdateCounter = function () {
    trigasFixedRenderCounter();
};

trigasTempUpdateCounter = function () {
    trigasFixedRenderCounter();
};

const trigasFixedPreviousRenderList = window.trigasTempRenderSerialListSafe;

window.trigasTempRenderSerialListSafe = function (forceExpanded = false) {
    if (typeof trigasFixedPreviousRenderList === 'function') {
        trigasFixedPreviousRenderList(forceExpanded);
    }

    trigasFixedRenderCounter();

    if (typeof trigasFinalRefreshState === 'function') {
        trigasFinalRefreshState();
    }
};

/* Cargar expected_qty al entrar y repintar */
setTimeout(async () => {
    await trigasFixedLoadExpectedQty();
    trigasFixedRenderCounter();

    if (window.trigasTempRenderSerialListSafe) {
        window.trigasTempRenderSerialListSafe(false);
    }
}, 500);

setTimeout(async () => {
    await trigasFixedLoadExpectedQty();
    trigasFixedRenderCounter();
}, 1500);

console.log('TRIGAS FIXED: contador personalizado esperado activo');


/* =========================================================
   TRIGAS PDA - FIX expected qty para PDA móvil
   Lee la cantidad esperada desde el contador nativo oculto si backend tarda.
   ========================================================= */

function trigasMobileReadExpectedQtyFromNativeCounter() {
    const productLine = document.querySelector('.o_barcode_client_action .o_barcode_line');

    if (!productLine) {
        return 0;
    }

    const qtyBox = productLine.querySelector('.o_barcode_scanner_qty');

    if (!qtyBox) {
        return 0;
    }

    const text = (qtyBox.textContent || '').trim();
    const match = text.match(/(\d+)\s*\/\s*(\d+)/);

    if (match && match[2]) {
        return Number(match[2]);
    }

    const qtyNodes = [...qtyBox.querySelectorAll('.qty-done, span')]
        .map(el => (el.textContent || '').trim())
        .filter(Boolean)
        .filter(txt => /^\d+$/.test(txt));

    if (qtyNodes.length >= 2) {
        return Number(qtyNodes[qtyNodes.length - 1]);
    }

    return 0;
}

function trigasMobileGetExpectedQtySafe() {
    let qty = 0;

    if (typeof trigasFixedGetExpectedQty === 'function') {
        qty = trigasFixedGetExpectedQty();
    }

    if (!qty && typeof trigasPdaGetExpectedQtyStored === 'function') {
        qty = trigasPdaGetExpectedQtyStored();
    }

    if (!qty) {
        qty = trigasMobileReadExpectedQtyFromNativeCounter();

        if (qty) {
            if (typeof trigasFixedSetExpectedQty === 'function') {
                trigasFixedSetExpectedQty(qty);
            }

            if (typeof trigasPdaSetExpectedQty === 'function') {
                trigasPdaSetExpectedQty(qty);
            }
        }
    }

    return qty || 0;
}

function trigasMobileRenderOwnCounterFinal() {
    const productLine = document.querySelector('.o_barcode_client_action .o_barcode_line');

    if (!productLine) {
        return;
    }

    const serials = typeof trigasTempGetSerials === 'function' ? trigasTempGetSerials() : [];
    const expectedQty = trigasMobileGetExpectedQtySafe();

    let counter = productLine.querySelector('.trigas-pda-own-counter');

    if (!counter) {
        counter = document.createElement('div');
        counter.className = 'trigas-pda-own-counter';

        const serialBox = productLine.querySelector('.trigas-simple-serial-list');
        const destinationBox = productLine.querySelector('.trigas-destination-status');

        if (serialBox) {
            productLine.insertBefore(counter, serialBox);
        } else if (destinationBox) {
            productLine.insertBefore(counter, destinationBox);
        } else {
            productLine.appendChild(counter);
        }
    }

    counter.textContent = 'Leídos: ' + serials.length + ' / ' + (expectedQty || '?');

    const complete = !!expectedQty && serials.length >= expectedQty;
    productLine.classList.toggle('trigas-temp-complete', complete);

    return {
        serials: serials,
        expectedQty: expectedQty,
        complete: complete,
    };
}

/* Sobrescribir expected qty con la versión segura para PDA */
trigasFinalGetExpectedQtyFromScreen = function () {
    return trigasMobileGetExpectedQtySafe();
};

trigasTempGetExpectedQty = function () {
    return trigasMobileGetExpectedQtySafe();
};

trigasFinalUpdateCounter = function () {
    trigasMobileRenderOwnCounterFinal();
};

trigasTempUpdateCounter = function () {
    trigasMobileRenderOwnCounterFinal();
};

const trigasMobilePreviousRenderList = window.trigasTempRenderSerialListSafe;

window.trigasTempRenderSerialListSafe = function (forceExpanded = false) {
    if (typeof trigasMobilePreviousRenderList === 'function') {
        trigasMobilePreviousRenderList(forceExpanded);
    }

    trigasMobileRenderOwnCounterFinal();

    if (typeof trigasFinalRefreshState === 'function') {
        trigasFinalRefreshState();
    }
};

setTimeout(() => {
    trigasMobileRenderOwnCounterFinal();

    if (window.trigasTempRenderSerialListSafe) {
        window.trigasTempRenderSerialListSafe(false);
    }
}, 400);

setTimeout(() => {
    trigasMobileRenderOwnCounterFinal();

    if (window.trigasTempRenderSerialListSafe) {
        window.trigasTempRenderSerialListSafe(false);
    }
}, 1200);

console.log('TRIGAS PDA: expected qty móvil seguro activo');


/* =========================================================
   TRIGAS PDA - Mostrar ubicación simple
   Correcta: nombre de ubicación
   Incorrecta: no es ubicación de camión
   ========================================================= */

trigasFinalRenderDestinationStatus = function () {
    const productLine = trigasFinalGetProductLine
        ? trigasFinalGetProductLine()
        : document.querySelector('.o_barcode_client_action .o_barcode_line');

    if (!productLine) {
        return;
    }

    let status = productLine.querySelector('.trigas-destination-status');

    if (!status) {
        status = document.createElement('div');
        status.className = 'trigas-destination-status';
        productLine.appendChild(status);
    }

    const destinationRead = trigasTempIsDestinationRead ? trigasTempIsDestinationRead() : false;

    let info = {};
    try {
        info = typeof trigasGetLocationReadInfo === 'function'
            ? trigasGetLocationReadInfo()
            : {};
    } catch (error) {
        info = {};
    }

    const locationName =
        info.read_location_name ||
        info.location_name ||
        info.scanned_value ||
        '';

    if (destinationRead) {
        status.textContent = locationName
            ? 'Ubicación leída: ' + locationName
            : 'Ubicación leída';

        status.classList.add('trigas-destination-ok');
        status.classList.remove('trigas-destination-pending', 'trigas-destination-error');
        return;
    }

    if (locationName) {
        status.textContent = 'No es una ubicación de camión: ' + locationName;

        status.classList.add('trigas-destination-error');
        status.classList.remove('trigas-destination-ok', 'trigas-destination-pending');
        return;
    }

    status.textContent = 'Pendiente leer ubicación destino';
    status.classList.add('trigas-destination-pending');
    status.classList.remove('trigas-destination-ok', 'trigas-destination-error');
};

console.log('TRIGAS PDA: texto simple de ubicación activo');


/* TRIGAS FIX FINAL - Mantener nombre ubicacion camion visible */
(function () {
    function trigasFixGetPickingIdFromUrl() {
        const match = String(window.location.hash || '').match(/active_id=(\d+)/);
        return match ? match[1] : '';
    }

    function trigasFixGetDestinationNameFromSuccessMessage() {
        const msg = document.querySelector('.trigas-temp-pda-message-success');
        const text = msg ? (msg.innerText || msg.textContent || '').trim() : '';

        if (!text) {
            return '';
        }

        return text
            .replace('Ubicación destino confirmada:', '')
            .replace('Ubicacion destino confirmada:', '')
            .replace('Ubicación leída:', '')
            .replace('Ubicacion leida:', '')
            .trim();
    }

    function trigasFixKeepTruckLocationVisible() {
        const pickingId = trigasFixGetPickingIdFromUrl();

        if (!pickingId) {
            return;
        }

        const readKey = 'trigas_destination_read_' + pickingId;
        const nameKey = 'trigas_destination_name_' + pickingId;

        const isRead = window.sessionStorage.getItem(readKey) === '1';

        if (!isRead) {
            return;
        }

        let destinationName = window.sessionStorage.getItem(nameKey) || '';
        const nameFromMessage = trigasFixGetDestinationNameFromSuccessMessage();

        if (!destinationName && nameFromMessage) {
            destinationName = nameFromMessage;
            window.sessionStorage.setItem(nameKey, destinationName);
        }

        if (!destinationName) {
            return;
        }

        const status = document.querySelector('.trigas-destination-status');

        if (!status) {
            return;
        }

        const expectedText = 'Ubicación leída: ' + destinationName;

        if ((status.innerText || status.textContent || '').trim() !== expectedText) {
            status.textContent = expectedText;
            status.classList.add('trigas-destination-ok');
            status.classList.remove('trigas-destination-pending');
        }
    }

    setInterval(trigasFixKeepTruckLocationVisible, 300);

    document.addEventListener('DOMContentLoaded', function () {
        setTimeout(trigasFixKeepTruckLocationVisible, 300);
        setTimeout(trigasFixKeepTruckLocationVisible, 1000);
    });

    console.log('TRIGAS FIX FINAL: ubicación camión visible activo');
})();


/* TRIGAS FIX FINAL - Boton validar verde */
(function () {
    function trigasFixGetPickingIdFromUrl() {
        const match = String(window.location.hash || '').match(/active_id=(\d+)/);
        return match ? match[1] : '';
    }

    function trigasFixFindValidateButton() {
        const root = document.querySelector('.o_barcode_client_action');

        if (!root) {
            return null;
        }

        const buttons = [...root.querySelectorAll('button, a, .btn')];

        return buttons.find(function (btn) {
            const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
            return text.includes('validar');
        }) || null;
    }

    
function trigasIsNativeOdooBarcodeScreenSafe() {
    const bodyText = document.body ? (document.body.innerText || '').toLowerCase() : '';
    const href = window.location.href.toLowerCase();
    const hash = window.location.hash.toLowerCase();

    return (
        bodyText.includes('wh/tri3/') ||
        bodyText.includes('wh/int/') ||
        href.includes('tri3') ||
        hash.includes('tri3') ||
        bodyText.includes('recogida de cilindros') ||
        bodyText.includes('transferencia interna') ||
        bodyText.includes('transferencias internas')
    );
}

function trigasCleanValidateButtonNativeSafe() {
    if (!trigasIsNativeOdooBarcodeScreenSafe()) {
        return;
    }

    const buttons = [...document.querySelectorAll('button, .btn, a')];
    const validateButtons = buttons.filter((btn) => {
        const txt = (btn.innerText || btn.textContent || '').trim().toLowerCase();
        return txt.includes('validar') || (btn.className || '').toString().includes('o_validate_page');
    });

    for (const btn of validateButtons) {
        btn.classList.remove(
            'trigas-validate-disabled',
            'trigas-validate-disabled-final',
            'trigas-validate-enabled',
            'trigas-validate-green-final'
        );

        btn.style.backgroundColor = '';
        btn.style.borderColor = '';
        btn.style.color = '';
        btn.style.fontWeight = '';
        btn.style.opacity = '';
        btn.style.filter = '';
    }
}

function trigasFixApplyValidateGreenState() {
    const bodyText = document.body ? (document.body.innerText || '') : '';

    // Este bloque viejo de botón verde no debe tocar Conduce 2.
    // En WH/TRI2 el botón VALIDAR lo controla únicamente trigasC2FlowControlValidateButton.
    // Si este bloque agrega trigas-validate-disabled-final mientras C2 agrega
    // trigas-c2-validate-blocked, se produce parpadeo visual.
    if (bodyText.includes('WH/TRI2/')) {
        return;
    }

    if (trigasIsNativeOdooBarcodeScreenSafe()) {
        trigasCleanValidateButtonNativeSafe();
        return;
    }

        const pickingId = trigasFixGetPickingIdFromUrl();

        if (!pickingId) {
            return;
        }

        const readKey = 'trigas_destination_read_' + pickingId;
        const isDestinationRead = window.sessionStorage.getItem(readKey) === '1';

        const btn = trigasFixFindValidateButton();

        if (!btn) {
            return;
        }

        if (isDestinationRead) {
            btn.classList.add('trigas-validate-green-final');
            btn.classList.remove('trigas-validate-disabled-final');

            btn.style.backgroundColor = '#198754';
            btn.style.borderColor = '#198754';
            btn.style.color = '#ffffff';
            btn.style.fontWeight = '800';
            btn.style.opacity = '1';
        } else {
            btn.classList.remove('trigas-validate-green-final');
            btn.classList.add('trigas-validate-disabled-final');

            btn.style.backgroundColor = '';
            btn.style.borderColor = '';
            btn.style.color = '';
            btn.style.fontWeight = '';
            btn.style.opacity = '';
        }
    }

    function trigasFixInjectValidateGreenCss() {
        if (document.getElementById('trigas-validate-green-final-css')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'trigas-validate-green-final-css';
        style.textContent = `
            .trigas-validate-green-final {
                background-color: #198754 !important;
                border-color: #198754 !important;
                color: #ffffff !important;
                font-weight: 800 !important;
                opacity: 1 !important;
            }

            .trigas-validate-green-final * {
                color: #ffffff !important;
            }
        `;

        document.head.appendChild(style);
    }

    trigasFixInjectValidateGreenCss();

    setInterval(function () {
        trigasFixInjectValidateGreenCss();
        trigasFixApplyValidateGreenState();
    }, 300);

    document.addEventListener('DOMContentLoaded', function () {
        setTimeout(trigasFixApplyValidateGreenState, 300);
        setTimeout(trigasFixApplyValidateGreenState, 1000);
    });

    console.log('TRIGAS FIX FINAL: botón validar verde activo');
})();


/* TRIGAS FIX FINAL - Conduce 2 client location frontend state and sync */
(function () {
    function trigasC2GetPickingIdFromUrl() {
        const match = String(window.location.hash || '').match(/active_id=(\d+)/);
        return match ? match[1] : '';
    }

    function trigasC2Key(name) {
        const pickingId = trigasC2GetPickingIdFromUrl();
        return pickingId ? ('trigas_client_location_' + name + '_' + pickingId) : '';
    }

    function trigasC2FindValidateButton() {
        const root = document.querySelector('.o_barcode_client_action');
        if (!root) {
            return null;
        }

        const buttons = [...root.querySelectorAll('button, a, .btn')];

        return buttons.find(function (btn) {
            const txt = (btn.innerText || btn.textContent || '').trim().toLowerCase();
            return txt.includes('validar');
        }) || null;
    }

    function trigasC2GetClientNameFromScreen() {
        const status = document.querySelector('.trigas-destination-status');
        const statusText = status ? (status.innerText || status.textContent || '').trim() : '';

        if (statusText && statusText.toLowerCase().includes('cliente')) {
            return statusText
                .replace('Ubicación leída:', '')
                .replace('Ubicacion leida:', '')
                .trim();
        }

        const bodyText = document.body ? document.body.innerText : '';
        const lines = String(bodyText || '').split('\n').map(function (line) {
            return line.trim();
        }).filter(Boolean);

        const clientLine = lines.find(function (line) {
            return line.includes('CLIENTES_TRIGAS/') || line.includes('/CLI');
        });

        if (clientLine) {
            return clientLine
                .replace('Ubicación leída:', '')
                .replace('Ubicacion leida:', '')
                .trim();
        }

        return '';
    }

    function trigasC2SaveClientLocationFromBarcodeModel(location) {
        const readKey = trigasC2Key('read');
        const idKey = trigasC2Key('id');
        const nameKey = trigasC2Key('name');

        if (!readKey || !location || !location.id) {
            return;
        }

        window.sessionStorage.setItem(readKey, '1');
        window.sessionStorage.setItem(idKey, String(location.id));
        window.sessionStorage.setItem(nameKey, location.display_name || location.name || '');

        console.log('TRIGAS C2: ubicación cliente guardada en frontend', {
            id: location.id,
            name: location.display_name || location.name || '',
        });
    }

    async function trigasC2SyncClientLocationBeforeValidate() {
        const pickingId = trigasC2GetPickingIdFromUrl();
        const idKey = trigasC2Key('id');
        const readKey = trigasC2Key('read');

        const locationId = Number(window.sessionStorage.getItem(idKey) || 0);
        const isRead = window.sessionStorage.getItem(readKey) === '1';

        if (!pickingId) {
            return {
                ok: false,
                message: 'No se pudo identificar el conduce actual.',
            };
        }

        let methodName = 'trigas_barcode_register_customer_location';
        let methodArgs = [[Number(pickingId)], locationId];

        if (!isRead && !locationId) {
            return {
                ok: false,
                message: 'Debes escanear la ubicación del cliente antes de validar el Conduce 2.',
            };
        }

        /*
           Si visualmente ya se leyó la ubicación cliente, pero no tenemos el ID en sessionStorage,
           usamos el backend para confirmar la ubicación cliente esperada del Conduce 2.
           Esto NO aplica a Conduce 1.
        */
        if (isRead && !locationId) {
            methodName = 'trigas_barcode_confirm_expected_customer_location_for_pda';
            methodArgs = [[Number(pickingId)]];
        }

        const response = await fetch('/web/dataset/call_kw/stock.picking/' + methodName, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials: 'same-origin',
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'call',
                params: {
                    model: 'stock.picking',
                    method: methodName,
                    args: methodArgs,
                    kwargs: {},
                },
                id: Date.now(),
            }),
        });

        const data = await response.json();

        if (data.error) {
            const message =
                data.error?.data?.message ||
                data.error?.data?.arguments?.[0] ||
                data.error?.message ||
                'No se pudo sincronizar la ubicación del cliente.';

            return {
                ok: false,
                message: message,
            };
        }

        return {
            ok: true,
            result: data.result,
        };
    }

    function trigasC2ShowError(message) {
        let box = document.querySelector('.trigas-c2-sync-error');

        if (!box) {
            box = document.createElement('div');
            box.className = 'trigas-c2-sync-error';
            box.style.margin = '8px 0';
            box.style.padding = '10px';
            box.style.borderRadius = '8px';
            box.style.background = '#f8d7da';
            box.style.color = '#842029';
            box.style.fontWeight = '700';

            const productLine = document.querySelector('.o_barcode_client_action .o_barcode_line');
            if (productLine) {
                productLine.appendChild(box);
            } else {
                document.body.prepend(box);
            }
        }

        box.textContent = message || 'No se pudo sincronizar la ubicación del cliente.';
    }

    function trigasC2LooksLikeConduce2Screen() {
        const text = document.body ? document.body.innerText : '';
        return (
            text.includes('WH/TRI2/') ||
            text.includes('Conduce 2') ||
            text.includes('CLIENTES_TRIGAS/')
        );
    }

    function trigasC2AttachValidateInterceptor() {
        const btn = trigasC2FindValidateButton();

        if (!btn || btn.__trigasC2ValidateInterceptor) {
            return;
        }

        btn.__trigasC2ValidateInterceptor = true;

        btn.addEventListener('click', async function (event) {
            if (!trigasC2LooksLikeConduce2Screen()) {
                return;
            }

            if (btn.__trigasC2ValidatedAndReleased) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            btn.disabled = true;
            const oldText = btn.innerText || btn.textContent || '';
            btn.innerText = 'Sincronizando...';

            const result = await trigasC2SyncClientLocationBeforeValidate();

            btn.disabled = false;
            btn.innerText = oldText || 'VALIDAR';

            if (!result.ok) {
                trigasC2ShowError(result.message);
                return;
            }

            btn.__trigasC2ValidatedAndReleased = true;
            btn.click();

            // TRIGAS REGLA 1 — TRI2: redirigir a Pantalla de Operaciones tras validar
            (function () {
                function onTri2Validated() {
                    window.removeEventListener('hashchange', onTri2Validated);
                    clearTimeout(cleanupTri2Timer);
                    trigasGoToOperaciones();
                }
                window.addEventListener('hashchange', onTri2Validated);
                var cleanupTri2Timer = setTimeout(function () {
                    window.removeEventListener('hashchange', onTri2Validated);
                }, 8000);
            })();
        }, true);
    }

    /*
       Enganche suave:
       Si el método original _trigasRegisterCustomerLocation existe,
       lo envolvemos para guardar también el estado en frontend.
    */
    function trigasC2PatchBarcodePrototype() {
        if (
            typeof BarcodePickingModel === 'undefined' ||
            !BarcodePickingModel.prototype ||
            BarcodePickingModel.prototype.__trigasC2Patched
        ) {
            return;
        }

        const originalRegister = BarcodePickingModel.prototype._trigasRegisterCustomerLocation;

        if (typeof originalRegister !== 'function') {
            return;
        }

        BarcodePickingModel.prototype._trigasRegisterCustomerLocation = async function (customerLocation, barcodeData) {
            const result = await originalRegister.call(this, customerLocation, barcodeData);

            if (result !== false && customerLocation && customerLocation.id) {
                trigasC2SaveClientLocationFromBarcodeModel(customerLocation);
            }

            return result;
        };

        BarcodePickingModel.prototype.__trigasC2Patched = true;
        console.log('TRIGAS C2: _trigasRegisterCustomerLocation envuelto para frontend state.');
    }

    setInterval(function () {
        trigasC2PatchBarcodePrototype();
        trigasC2AttachValidateInterceptor();

        const nameKey = trigasC2Key('name');
        const readKey = trigasC2Key('read');

        if (nameKey && !window.sessionStorage.getItem(nameKey)) {
            const nameFromScreen = trigasC2GetClientNameFromScreen();
            if (nameFromScreen) {
                window.sessionStorage.setItem(readKey, '1');
                window.sessionStorage.setItem(nameKey, nameFromScreen);
            }
        }
    }, 300);

    console.log('TRIGAS FIX FINAL: Conduce 2 frontend state + sync activo');
})();


/* TRIGAS FIX FINAL - Boton firma independiente Conduce 2 */
(function () {
    function trigasC2SignGetPickingId() {
        const match = String(window.location.hash || '').match(/active_id=(\d+)/);
        return match ? Number(match[1]) : 0;
    }

    function trigasC2SignNormalize(text) {
        return String(text || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    }

    function trigasC2SignIsScreen() {
        const text = document.body ? document.body.innerText || '' : '';
        return (
            text.includes('WH/TRI2/') ||
            text.includes('Conduce 2') ||
            text.includes('CLIENTES_TRIGAS/')
        );
    }

    function trigasC2SignHasCompleteSerials() {
        const text = document.body ? document.body.innerText || '' : '';
        return /Leídos:\s*3\s*\/\s*3/i.test(text) || /Leidos:\s*3\s*\/\s*3/i.test(text) || /3\s*\/\s*3/.test(text);
    }

    function trigasC2SignHasClientLocation() {
        /*
           IMPORTANTE:
           No basta con que CLIENTES_TRIGAS aparezca en cualquier parte.
           Solo permitimos firmar cuando el bloque fijo indique que la ubicación
           cliente fue leída correctamente.
        */
        const status = document.querySelector('.trigas-destination-status');
        const statusText = status ? (status.innerText || status.textContent || '').trim() : '';

        return (
            statusText.includes('Ubicación leída: CLIENTES_TRIGAS/') ||
            statusText.includes('Ubicacion leida: CLIENTES_TRIGAS/')
        );
    }

    function trigasC2SignAlreadySigned() {
        const text = trigasC2SignNormalize(document.body ? document.body.innerText || '' : '');
        return (
            text.includes('firma registrada') ||
            text.includes('firmado')
        );
    }

    function trigasC2SignCanShowButton() {
        return (
            trigasC2SignIsScreen() &&
            trigasC2SignHasCompleteSerials() &&
            trigasC2SignHasClientLocation() &&
            !trigasC2SignAlreadySigned()
        );
    }

    function trigasC2SignRemoveButton() {
        const existing = document.getElementById('trigas_c2_signature_button_wrapper_final');
        if (existing) {
            existing.remove();
        }
    }

    function trigasC2SignShowMessage(message, type) {
        let box = document.querySelector('.trigas-c2-sign-message-final');

        if (!box) {
            box = document.createElement('div');
            box.className = 'trigas-c2-sign-message-final';

            const productLine = document.querySelector('.o_barcode_client_action .o_barcode_line');
            if (productLine) {
                productLine.appendChild(box);
            } else {
                document.body.prepend(box);
            }
        }

        box.textContent = message || '';

        box.style.margin = '8px 0';
        box.style.padding = '10px';
        box.style.borderRadius = '8px';
        box.style.fontWeight = '800';

        if (type === 'success') {
            box.style.background = '#d1e7dd';
            box.style.color = '#0f5132';
        } else {
            box.style.background = '#f8d7da';
            box.style.color = '#842029';
        }
    }

    async function trigasC2SignCallBackend(methodName, args) {
        const response = await fetch('/web/dataset/call_kw/stock.picking/' + methodName, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials: 'same-origin',
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'call',
                params: {
                    model: 'stock.picking',
                    method: methodName,
                    args: args,
                    kwargs: {},
                },
                id: Date.now(),
            }),
        });

        const data = await response.json();

        if (data.error) {
            const message =
                data.error?.data?.message ||
                data.error?.data?.arguments?.[0] ||
                data.error?.message ||
                'Error ejecutando acción.';

            throw new Error(message);
        }

        return data.result;
    }

    function trigasC2SignOpenModal() {
        const pickingId = trigasC2SignGetPickingId();

        if (!pickingId) {
            trigasC2SignShowMessage('No se pudo identificar el conduce actual.', 'error');
            return;
        }

        const oldModal = document.getElementById('trigas_c2_signature_modal_final');
        if (oldModal) {
            oldModal.remove();
        }

        const wrapper = document.createElement('div');
        wrapper.id = 'trigas_c2_signature_modal_final';
        wrapper.style.position = 'fixed';
        wrapper.style.left = '0';
        wrapper.style.right = '0';
        wrapper.style.top = '0';
        wrapper.style.bottom = '0';
        wrapper.style.zIndex = '200000';
        wrapper.style.background = 'rgba(0,0,0,0.55)';
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.justifyContent = 'center';
        wrapper.style.padding = '12px';

        const modal = document.createElement('div');
        modal.style.background = '#fff';
        modal.style.borderRadius = '12px';
        modal.style.width = '100%';
        modal.style.maxWidth = '430px';
        modal.style.padding = '14px';
        modal.style.boxShadow = '0 8px 30px rgba(0,0,0,0.35)';

        const title = document.createElement('div');
        title.textContent = 'Firma de entrega';
        title.style.fontWeight = '900';
        title.style.fontSize = '18px';
        title.style.marginBottom = '10px';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Nombre de quien recibe';
        input.style.width = '100%';
        input.style.padding = '10px';
        input.style.marginBottom = '10px';
        input.style.border = '1px solid #ccc';
        input.style.borderRadius = '8px';
        input.style.fontSize = '15px';

        const canvas = document.createElement('canvas');
        canvas.width = 380;
        canvas.height = 180;
        canvas.style.width = '100%';
        canvas.style.height = '180px';
        canvas.style.border = '1px solid #999';
        canvas.style.borderRadius = '8px';
        canvas.style.background = '#fff';
        canvas.style.touchAction = 'none';

        const ctx = canvas.getContext('2d');
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000';

        let drawing = false;
        let hasDrawn = false;

        function getPos(event) {
            const rect = canvas.getBoundingClientRect();
            const point = event.touches ? event.touches[0] : event;
            return {
                x: (point.clientX - rect.left) * (canvas.width / rect.width),
                y: (point.clientY - rect.top) * (canvas.height / rect.height),
            };
        }

        function start(event) {
            event.preventDefault();
            drawing = true;
            hasDrawn = true;
            const pos = getPos(event);
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
        }

        function move(event) {
            if (!drawing) {
                return;
            }
            event.preventDefault();
            const pos = getPos(event);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        }

        function end(event) {
            if (event) {
                event.preventDefault();
            }
            drawing = false;
        }

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
        clearBtn.textContent = 'Limpiar';
        clearBtn.className = 'btn btn-secondary';
        clearBtn.style.flex = '1';
        clearBtn.onclick = function () {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            hasDrawn = false;
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancelar';
        cancelBtn.className = 'btn btn-light';
        cancelBtn.style.flex = '1';
        cancelBtn.onclick = function () {
            wrapper.remove();
        };

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.textContent = 'Guardar firma';
        saveBtn.className = 'btn btn-primary';
        saveBtn.style.flex = '1.5';

        saveBtn.onclick = async function () {
            const signedBy = (input.value || '').trim();

            if (!signedBy) {
                trigasC2SignShowMessage('Debes indicar el nombre de quien recibe.', 'error');
                return;
            }

            if (!hasDrawn) {
                trigasC2SignShowMessage('Debes realizar la firma antes de guardar.', 'error');
                return;
            }

            saveBtn.disabled = true;
            saveBtn.textContent = 'Guardando...';

            try {
                await trigasC2SignCallBackend(
                    'trigas_barcode_confirm_expected_customer_location_for_pda',
                    [[pickingId]]
                );

                const signatureBase64 = canvas.toDataURL('image/png');

                await trigasC2SignCallBackend(
                    'trigas_barcode_save_delivery_signature',
                    [[pickingId], signedBy, signatureBase64]
                );

                window.sessionStorage.setItem('trigas_c2_signature_saved_' + pickingId, '1');

                wrapper.remove();
                trigasC2SignRemoveButton();
                trigasC2SignShowMessage('Firma registrada correctamente.', 'success');

            } catch (error) {
                trigasC2SignShowMessage(error.message || 'No se pudo guardar la firma.', 'error');
                saveBtn.disabled = false;
                saveBtn.textContent = 'Guardar firma';
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
    }

    function trigasC2SignEnsureButton() {
        if (!trigasC2SignCanShowButton()) {
            return;
        }

        if (document.getElementById('trigas_c2_signature_button_wrapper_final')) {
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.id = 'trigas_c2_signature_button_wrapper_final';
        wrapper.style.position = 'fixed';
        wrapper.style.left = '20px';
        wrapper.style.right = '20px';
        wrapper.style.bottom = '86px';
        wrapper.style.zIndex = '150000';
        wrapper.style.display = 'flex';
        wrapper.style.justifyContent = 'center';
        wrapper.style.pointerEvents = 'none';

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '✍ FIRMAR CLIENTE';
        button.className = 'btn btn-primary';
        button.style.width = '86%';
        button.style.maxWidth = '320px';
        button.style.padding = '12px';
        button.style.fontWeight = '900';
        button.style.fontSize = '15px';
        button.style.borderRadius = '10px';
        button.style.pointerEvents = 'auto';
        button.style.backgroundColor = '#0d6efd';
        button.style.borderColor = '#0d6efd';
        button.style.color = '#fff';

        button.onclick = function (event) {
            event.preventDefault();
            event.stopPropagation();
            trigasC2SignOpenModal();
        };

        wrapper.appendChild(button);
        document.body.appendChild(wrapper);
    }

    setInterval(function () {
        if (!trigasC2SignIsScreen()) {
            trigasC2SignRemoveButton();
            return;
        }

        trigasC2SignEnsureButton();
    }, 500);

    console.log('TRIGAS FIX FINAL: botón firma independiente Conduce 2 activo');
})();


/* TRIGAS FIX FINAL - Control flujo firma y validar Conduce 2 */
(function () {
    function trigasC2FlowGetPickingId() {
        const match = String(window.location.hash || '').match(/active_id=(\d+)/);
        return match ? Number(match[1]) : 0;
    }

    function trigasC2FlowIsScreen() {
        const text = document.body ? document.body.innerText || '' : '';
        return (
            text.includes('WH/TRI2/') ||
            text.includes('Conduce 2') ||
            text.includes('CLIENTES_TRIGAS/')
        );
    }

    function trigasC2FlowHasCompleteSerials() {
        const text = document.body ? document.body.innerText || '' : '';
        return /Leídos:\s*3\s*\/\s*3/i.test(text) || /Leidos:\s*3\s*\/\s*3/i.test(text) || /3\s*\/\s*3/.test(text);
    }

    function trigasC2FlowHasCorrectClientLocation() {
        const status = document.querySelector('.trigas-destination-status');
        const statusText = status ? (status.innerText || status.textContent || '').trim() : '';

        return (
            statusText.includes('Ubicación leída: CLIENTES_TRIGAS/') ||
            statusText.includes('Ubicacion leida: CLIENTES_TRIGAS/')
        );
    }

    function trigasC2FlowSignatureSaved() {
        const pickingId = trigasC2FlowGetPickingId();
        const text = document.body ? document.body.innerText || '' : '';

        return (
            Boolean(pickingId && window.sessionStorage.getItem('trigas_c2_signature_saved_' + pickingId) === '1') ||
            text.includes('Firma registrada correctamente') ||
            text.includes('Firma registrada')
        );
    }

    function trigasC2FlowFindValidateButton() {
        const root = document.querySelector('.o_barcode_client_action') || document.body;

        const buttons = [...root.querySelectorAll('button, a, .btn')];

        return buttons.find(function (btn) {
            const txt = (btn.innerText || btn.textContent || '').trim().toLowerCase();
            return txt.includes('validar');
        }) || null;
    }

    function trigasC2FlowShowMessage(message) {
        let box = document.querySelector('.trigas-c2-flow-message');

        if (!box) {
            box = document.createElement('div');
            box.className = 'trigas-c2-flow-message';

            const productLine = document.querySelector('.o_barcode_client_action .o_barcode_line');
            if (productLine) {
                productLine.appendChild(box);
            } else {
                document.body.prepend(box);
            }
        }

        box.textContent = message;
        box.style.margin = '8px 0';
        box.style.padding = '10px';
        box.style.borderRadius = '8px';
        box.style.background = '#fff3cd';
        box.style.color = '#664d03';
        box.style.fontWeight = '800';
    }

    function trigasC2FlowControlSignatureButton() {
        const buttonWrapper = document.getElementById('trigas_c2_signature_button_wrapper_final');

        if (!trigasC2FlowIsScreen()) {
            if (buttonWrapper) {
                buttonWrapper.remove();
            }
            return;
        }

        const allowSignatureButton = (
            trigasC2FlowHasCompleteSerials() &&
            trigasC2FlowHasCorrectClientLocation() &&
            !trigasC2FlowSignatureSaved()
        );

        if (!allowSignatureButton && buttonWrapper) {
            buttonWrapper.remove();
        }
    }


    function trigasC2FlowIsStrictConduce2Screen() {
        const bodyText = document.body ? (document.body.innerText || '').toLowerCase() : '';
        const href = window.location.href.toLowerCase();
        const hash = window.location.hash.toLowerCase();

        const isTri2 = (
            bodyText.includes('wh/tri2/') ||
            href.includes('tri2') ||
            hash.includes('tri2')
        );

        const isNativeTri3OrInternal = (
            bodyText.includes('wh/tri3/') ||
            bodyText.includes('wh/int/') ||
            bodyText.includes('recogida de cilindros') ||
            bodyText.includes('transferencia interna') ||
            bodyText.includes('transferencias internas')
        );

        return isTri2 && !isNativeTri3OrInternal;
    }

    function trigasC2FlowCleanValidateButtonOutsideC2() {
        const buttons = [...document.querySelectorAll('button, .btn, a')];

        for (const btn of buttons) {
            const txt = (btn.innerText || btn.textContent || '').trim().toLowerCase();
            const cls = String(btn.className || '').toLowerCase();

            if (!txt.includes('validar') && !cls.includes('validate')) {
                continue;
            }

            btn.classList.remove(
                'trigas-c2-validate-ready',
                'trigas-c2-validate-blocked',
                'trigas-validate-disabled',
                'trigas-validate-disabled-final',
                'trigas-validate-enabled',
                'trigas-validate-green-final'
            );

            btn.style.backgroundColor = '';
            btn.style.borderColor = '';
            btn.style.color = '';
            btn.style.fontWeight = '';
            btn.style.opacity = '';
            btn.style.pointerEvents = '';
            btn.style.filter = '';

            if (btn.__trigasC2BlockedClick) {
                btn.removeEventListener('click', btn.__trigasC2BlockedClick, true);
                btn.__trigasC2BlockedClick = null;
            }
        }
    }


    function trigasC2FlowControlValidateButton() {
        // Esta lógica pertenece solo al Conduce 2.
        // TRI3 Recogida y WH/INT quedan 100% nativos de Odoo.
        if (!trigasC2FlowIsStrictConduce2Screen()) {
            // IMPORTANTE:
            // En Conduce 1, el botón VALIDAR lo controla el flujo TRI1.
            // Si Conduce 2 limpia estas clases fuera de TRI2, provoca parpadeo:
            // TRI1 agrega trigas-validate-disabled y C2 la quita cada 300ms.
            const bodyText = document.body ? (document.body.innerText || '') : '';
            if (bodyText.includes('WH/TRI1/')) {
                return;
            }

            trigasC2FlowCleanValidateButtonOutsideC2();
            return;
        }

        if (!trigasC2FlowIsScreen()) {
            return;
        }

        const btn = trigasC2FlowFindValidateButton();

        if (!btn) {
            return;
        }

        const hasSerials = trigasC2FlowHasCompleteSerials();
        const hasLocation = trigasC2FlowHasCorrectClientLocation();
        const hasSignature = trigasC2FlowSignatureSaved();

        const canValidate = hasSerials && hasLocation && hasSignature;

        if (canValidate) {
            btn.classList.add('trigas-c2-validate-ready');
            btn.classList.remove('trigas-c2-validate-blocked');

            btn.style.backgroundColor = '#198754';
            btn.style.borderColor = '#198754';
            btn.style.color = '#ffffff';
            btn.style.fontWeight = '900';
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';

            if (btn.__trigasC2BlockedClick) {
                btn.removeEventListener('click', btn.__trigasC2BlockedClick, true);
                btn.__trigasC2BlockedClick = null;
            }

            return;
        }

        btn.classList.remove('trigas-c2-validate-ready');
        btn.classList.add('trigas-c2-validate-blocked');

        btn.style.backgroundColor = '#adb5bd';
        btn.style.borderColor = '#adb5bd';
        btn.style.color = '#ffffff';
        btn.style.fontWeight = '900';
        btn.style.opacity = '0.9';
        btn.style.pointerEvents = 'auto';

        if (!btn.__trigasC2BlockedClick) {
            btn.__trigasC2BlockedClick = function (event) {
                if (!trigasC2FlowIsScreen()) {
                    return;
                }

                if (trigasC2FlowHasCompleteSerials() && trigasC2FlowHasCorrectClientLocation() && trigasC2FlowSignatureSaved()) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();

                if (!trigasC2FlowHasCompleteSerials()) {
                    trigasC2FlowShowMessage('Debes escanear todos los seriales antes de validar.');
                    return;
                }

                if (!trigasC2FlowHasCorrectClientLocation()) {
                    trigasC2FlowShowMessage('Debes escanear la ubicación correcta del cliente antes de validar.');
                    return;
                }

                trigasC2FlowShowMessage('Debes registrar la firma del cliente antes de validar el Conduce 2.');
            };

            btn.addEventListener('click', btn.__trigasC2BlockedClick, true);
        }
    }

    setInterval(function () {
        trigasC2FlowControlSignatureButton();
        trigasC2FlowControlValidateButton();
    }, 300);

    console.log('TRIGAS FIX FINAL: flujo Conduce 2 firma antes de validar activo');
})();
















































/* TRIGAS FIX FINAL - TRI3 botones frontend only */
(function () {
    if (window.__trigasTri3FrontendOnlyButtonsStarted) {
        return;
    }

    window.__trigasTri3FrontendOnlyButtonsStarted = true;
    window.__trigasTri3FrontendButtonsOnly = true;

    /*
       TRIGAS FIX: Odoo vuelve a renderizar la barra de botones del Barcode
       (OWL) en cada cambio de estado, lo que recreaba el botón nativo
       "Validar"/"Añadir producto" justo después de que un setInterval lo
       ocultara con `style.display = 'none'`. Ese tira y afloja producía un
       parpadeo visible. En vez de pelear contra el re-render reaplicando
       estilos por JS, ocultamos/coloreamos esos botones con CSS persistente
       basado en sus clases nativas estables (`o_add_line`, `o_validate_page`)
       y una clase de estado en <body>: el navegador aplica la regla en cada
       render, sin huecos visibles.
    */
    function ensureTri3Styles() {
        if (document.getElementById('trigas-tri3-dynamic-style')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'trigas-tri3-dynamic-style';
        style.textContent = `
            body.trigas-tri3-active .o_barcode_client_action .o_add_line {
                display: none !important;
            }
            body.trigas-tri3-active.trigas-tri3-pending-signature .o_barcode_client_action .o_validate_page {
                display: none !important;
            }
            body.trigas-tri3-active.trigas-tri3-signed .o_barcode_client_action .o_validate_page {
                background-color: #198754 !important;
                border-color: #198754 !important;
                color: #ffffff !important;
                font-weight: 900 !important;
                opacity: 1 !important;
                pointer-events: auto !important;
            }
        `;
        document.head.appendChild(style);
    }

    function applyTri3ButtonState(signed) {
        document.body.classList.add('trigas-tri3-active');
        document.body.classList.toggle('trigas-tri3-pending-signature', !signed);
        document.body.classList.toggle('trigas-tri3-signed', signed);
    }

    function clearTri3ButtonState() {
        document.body.classList.remove(
            'trigas-tri3-active',
            'trigas-tri3-pending-signature',
            'trigas-tri3-signed'
        );
    }

    function getPickingId() {
        const match = String(window.location.hash || '').match(/active_id=(\d+)/);
        return match ? String(match[1]) : '';
    }

    function isTri3Screen() {
        const text = document.body ? (document.body.innerText || '') : '';
        const hasBarcodeClientAction = !!document.querySelector('.o_barcode_client_action');
        return hasBarcodeClientAction && text.includes('WH/TRI3/');
    }

    function signedKey() {
        const pickingId = getPickingId();
        return pickingId ? 'trigas_tri3_signature_saved_' + pickingId : '';
    }

    function isSignedFrontend() {
        const key = signedKey();
        const text = document.body ? (document.body.innerText || '') : '';

        return Boolean(
            key && window.sessionStorage.getItem(key) === '1'
        ) || text.includes('Firma registrada correctamente') || text.includes('Firma registrada');
    }

    function markSignedFrontend() {
        const key = signedKey();
        if (key) {
            window.sessionStorage.setItem(key, '1');
        }
    }

    function hasTruckDestinationVisible() {
        const root = document.querySelector('.o_barcode_client_action');
        if (!root) {
            return false;
        }

        const badge = root.querySelector('.trigas-tri3-truck-destination-badge');
        const text = root.innerText || '';

        return Boolean(
            badge ||
            text.includes('Destino camión leído') ||
            text.includes('Destino camion leído') ||
            text.includes('WH/Stock/Camion') ||
            text.includes('WH/Stock/Camión')
        );
    }

    function removeSignButton() {
        const existing = document.getElementById('trigas_tri3_frontend_signature_button_wrapper');
        if (existing) {
            existing.remove();
        }
    }

    function removeCancelButton() {
        const existing = document.getElementById('trigas_tri3_cancel_button');
        if (existing) {
            existing.remove();
        }
    }

    function hookSignatureSaveButton() {
        setTimeout(() => {
            const modal = document.getElementById('trigas_signature_modal_wrapper');
            if (!modal) {
                return;
            }

            const buttons = [...modal.querySelectorAll('button, .btn')];
            const saveBtn = buttons.find((btn) => {
                const txt = (btn.innerText || btn.textContent || '').trim().toLowerCase();
                return txt.includes('guardar firma');
            });

            if (!saveBtn || saveBtn.__trigasTri3FrontendHooked) {
                return;
            }

            saveBtn.__trigasTri3FrontendHooked = true;

            saveBtn.addEventListener('click', function () {
                /*
                   Si la firma se guarda bien, el modal se cierra.
                   Solo marcamos firmado si el modal ya no existe.
                */
                setTimeout(() => {
                    const stillOpen = document.getElementById('trigas_signature_modal_wrapper');
                    if (!stillOpen) {
                        markSignedFrontend();
                        controlButtons();
                    }
                }, 1200);

                setTimeout(() => {
                    const stillOpen = document.getElementById('trigas_signature_modal_wrapper');
                    if (!stillOpen) {
                        markSignedFrontend();
                        controlButtons();
                    }
                }, 2200);
            }, true);
        }, 250);
    }

    function ensureSignButton() {
        if (document.getElementById('trigas_tri3_frontend_signature_button_wrapper')) {
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.id = 'trigas_tri3_frontend_signature_button_wrapper';

        wrapper.style.position = 'fixed';
        wrapper.style.left = '0';
        wrapper.style.right = '0';
        wrapper.style.bottom = '52px';
        wrapper.style.zIndex = '150000';
        wrapper.style.display = 'flex';
        wrapper.style.justifyContent = 'center';
        wrapper.style.background = '#ffffff';
        wrapper.style.borderTop = '1px solid #ddd';

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '✍ FIRMAR';
        button.className = 'btn btn-primary';

        button.style.width = '100%';
        button.style.height = '38px';
        button.style.borderRadius = '0';
        button.style.fontWeight = '900';
        button.style.fontSize = '14px';
        button.style.backgroundColor = '#0d6efd';
        button.style.borderColor = '#0d6efd';
        button.style.color = '#ffffff';

        button.onclick = function (event) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            const model = window.__trigasBarcodePickingModel || null;

            if (!model || typeof model._trigasOpenSignatureModal !== 'function') {
                alert('No se pudo abrir la firma en esta pantalla.');
                return;
            }

            model._trigasOpenSignatureModal();
            hookSignatureSaveButton();
        };

        wrapper.appendChild(button);
        document.body.appendChild(wrapper);
    }

    function ensureCancelButton() {
        const signWrapper = document.getElementById('trigas_tri3_frontend_signature_button_wrapper');
        const bottomPos = signWrapper ? '96px' : '52px';

        const existing = document.getElementById('trigas_tri3_cancel_button');
        if (existing) {
            existing.style.bottom = bottomPos;
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.id = 'trigas_tri3_cancel_button';

        wrapper.style.position = 'fixed';
        wrapper.style.left = '0';
        wrapper.style.right = '0';
        wrapper.style.bottom = bottomPos;
        wrapper.style.zIndex = '150000';
        wrapper.style.display = 'flex';
        wrapper.style.justifyContent = 'center';
        wrapper.style.background = '#ffffff';
        wrapper.style.borderTop = '1px solid #ddd';

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '← CANCELAR';
        button.className = 'btn btn-secondary text-uppercase o_cancel_button';

        button.style.width = '100%';
        button.style.height = '44px';
        button.style.borderRadius = '0';
        button.style.fontWeight = '800';
        button.style.fontSize = '15px';
        button.style.backgroundColor = '#6c757d';
        button.style.borderColor = '#6c757d';
        button.style.color = '#ffffff';

        button.onclick = async function (event) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            const pickingId = getPickingId();
            if (!pickingId) {
                trigasGoToOperaciones();
                return;
            }

            const bodyText = document.body ? (document.body.innerText || '') : '';
            const nameMatch = bodyText.match(/WH\/TRI3\/\d+/i);
            const pickingName = nameMatch ? nameMatch[0] : ('Picking #' + pickingId);

            if (!window.confirm('¿Cancelar la recogida ' + pickingName + '?')) {
                return;
            }

            try {
                const response = await fetch('/web/dataset/call_kw/stock.picking/action_cancel', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'call',
                        params: {
                            model: 'stock.picking',
                            method: 'action_cancel',
                            args: [[parseInt(pickingId, 10)]],
                            kwargs: {},
                        },
                        id: Date.now(),
                    }),
                });

                const data = await response.json();

                if (data.error) {
                    throw data.error;
                }

                trigasGoToOperaciones();
            } catch (error) {
                console.log('TRIGAS TRI3: error cancelando picking', error);
                window.alert('Error al cancelar la recogida. Intente de nuevo.');
            }
        };

        wrapper.appendChild(button);
        document.body.appendChild(wrapper);
    }

    function controlButtons() {
        if (!isTri3Screen()) {
            clearTri3ButtonState();
            removeSignButton();
            removeCancelButton();
            return;
        }

        ensureTri3Styles();
        ensureCancelButton();

        const signed = isSignedFrontend();
        const truckReady = hasTruckDestinationVisible();

        applyTri3ButtonState(signed);

        if (signed) {
            removeSignButton();
            return;
        }

        if (truckReady) {
            ensureSignButton();
        } else {
            removeSignButton();
        }
    }

    setInterval(controlButtons, 300);

    document.addEventListener('click', function () {
        setTimeout(controlButtons, 100);
        setTimeout(controlButtons, 400);
    }, true);

    document.addEventListener('keydown', function () {
        setTimeout(controlButtons, 100);
        setTimeout(controlButtons, 400);
        setTimeout(controlButtons, 1000);
    }, true);

    console.log('TRIGAS FIX FINAL: TRI3 botones frontend only activo');
})();


/* TRIGAS FIX FINAL - TRI3 ocultar FIRMAR mientras modal está abierto */
(function () {
    if (window.__trigasTri3HideSignWhileModalStarted) {
        return;
    }

    window.__trigasTri3HideSignWhileModalStarted = true;

    function isTri3Screen() {
        const text = document.body ? (document.body.innerText || '') : '';
        const hasBarcodeClientAction = !!document.querySelector('.o_barcode_client_action');
        return hasBarcodeClientAction && text.includes('WH/TRI3/');
    }

    function getPickingId() {
        const match = String(window.location.hash || '').match(/active_id=(\d+)/);
        return match ? String(match[1]) : '';
    }

    function signedKey() {
        const pickingId = getPickingId();
        return pickingId ? 'trigas_tri3_signature_saved_' + pickingId : '';
    }

    function markSignedFrontend() {
        const key = signedKey();
        if (key) {
            window.sessionStorage.setItem(key, '1');
        }
    }

    function hasModalOpen() {
        return !!document.getElementById('trigas_signature_modal_wrapper');
    }

    function getSignButtonWrapper() {
        return document.getElementById('trigas_tri3_frontend_signature_button_wrapper');
    }

    function hasSignatureSuccessMessage() {
        const text = document.body ? (document.body.innerText || '') : '';
        return (
            text.includes('Firma registrada correctamente') ||
            text.includes('Firma registrada')
        );
    }

    function syncSignButtonWithModal() {
        if (!isTri3Screen()) {
            return;
        }

        const wrapper = getSignButtonWrapper();

        if (hasSignatureSuccessMessage()) {
            markSignedFrontend();
            if (wrapper) {
                wrapper.remove();
            }
            return;
        }

        if (hasModalOpen()) {
            if (wrapper) {
                wrapper.style.display = 'none';
            }
            return;
        }

        /*
           Si el modal se cerró sin guardar, volvemos a permitir que el control
           frontend principal muestre FIRMAR otra vez.
        */
        if (wrapper) {
            wrapper.style.display = '';
        }
    }

    setInterval(syncSignButtonWithModal, 200);

    document.addEventListener('click', function () {
        setTimeout(syncSignButtonWithModal, 80);
        setTimeout(syncSignButtonWithModal, 300);
        setTimeout(syncSignButtonWithModal, 900);
    }, true);

    console.log('TRIGAS FIX FINAL: TRI3 ocultar FIRMAR durante modal activo');
})();









/* TRIGAS MENU BARCODE: bloque visual anterior removido */







/* TRIGAS MENU BARCODE: bloque visual anterior removido */




/* =========================================================
   TRIGAS PDA - MENU CODIGO DE BARRAS VISUAL FINAL UNICO
   Solo action=407/menu_id=246. No aplica a Resumen de inventario.
   ========================================================= */
(function () {
    function normalizeText(text) {
        return String(text || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    function isBarcodeRoute() {
        if (!document.body) {
            return false;
        }

        const hash = normalizeText(window.location.hash || '');
        const href = normalizeText(window.location.href || '');

        // Solo aplicar visual del menú principal en la acción real de Operaciones.
        // No usar menu_id=246 porque también aparece en listas de pickings como WH/INT,
        // y eso provoca pelea visual con la lista de Transferencias Internas.
        return (
            hash.includes('action=407') ||
            href.includes('action=407')
        );
    }

    // Mientras la ruta ya apunta al menú de operaciones pero el contenido
    // todavía no confirma cuál pantalla es (kanban final vs. detalle de
    // escaneo), mantenemos un estado "pending": ocultamos el kanban nativo
    // sin estilizar y mostramos un spinner, evitando así el parpadeo de la
    // vista por defecto de stock.picking.type antes de aplicar el estilo
    // final. Si la confirmación tarda demasiado, liberamos la pantalla.
    let pendingSince = null;

    // Activa el estado "pending" de inmediato, en el mismo evento de click
    // sobre el breadcrumb/enlace "Operaciones", antes de que Odoo empiece a
    // montar el kanban nativo. Esto cierra la ventana de carrera que dejaba
    // pintar un primer frame con el estilo por defecto.
    function engagePendingNow() {
        if (!document.body) {
            return;
        }
        injectStableMenuCss();
        pendingSince = Date.now();
        document.body.classList.remove('trigas-barcode-main-menu-screen');
        document.body.classList.add('trigas-barcode-route-pending');
    }

    function applyBarcodeMenuClass() {
        if (!document.body) {
            return;
        }

        const route = isBarcodeRoute();
        const text = normalizeText(document.body.innerText || '');

        const hasOperations = (
            text.includes('transferencias internas') ||
            text.includes('entrega a camion') ||
            text.includes('entrega a cliente') ||
            text.includes('recogida de cilindros')
        );

        const isDetail = (
            text.includes('wh/tri1/') ||
            text.includes('wh/tri2/') ||
            text.includes('wh/tri3/') ||
            text.includes('wh/int/') ||
            text.includes('escanear producto') ||
            text.includes('validar')
        );

        const isInventorySummary = (
            text.includes('resumen de inventario') ||
            (
                text.includes('informacion general') &&
                !route
            )
        );

        const ready = !!(route && hasOperations && !isDetail && !isInventorySummary);

        // Solo mostramos el spinner cuando hay un kanban realmente montado en
        // el DOM (la señal real de que Odoo está pintando la pantalla de
        // operaciones con su estilo nativo) y todavía no podemos confirmar
        // que es la pantalla final. Así evitamos disparar el spinner en
        // transiciones hacia otras pantallas (escaneo, validación, etc.)
        // donde nunca existió un kanban que ocultar.
        const kanbanEl = document.querySelector('.o_kanban_view');
        let pending = !!(route && kanbanEl && !ready && !isDetail && !isInventorySummary);

        if (pending) {
            if (pendingSince === null) {
                pendingSince = Date.now();
            } else if (Date.now() - pendingSince > 2500) {
                pending = false;
            }
        } else {
            pendingSince = null;
        }

        document.body.classList.toggle('trigas-barcode-route-pending', pending);
        document.body.classList.toggle('trigas-barcode-main-menu-screen', ready);
    }

    function injectStableMenuCss() {
        if (document.getElementById('trigas-barcode-main-menu-final-css')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'trigas-barcode-main-menu-final-css';
        style.textContent = `
            body.trigas-barcode-route-pending .o_kanban_view {
                opacity: 0 !important;
                pointer-events: none !important;
                transition: none !important;
            }

            body.trigas-barcode-main-menu-screen .o_kanban_view {
                opacity: 1 !important;
                transition: opacity 0.18s ease-in !important;
            }

            body.trigas-barcode-route-pending::after {
                content: '';
                position: fixed;
                top: 50%;
                left: 50%;
                width: 42px;
                height: 42px;
                margin: -21px 0 0 -21px;
                border: 4px solid #d8d8d8;
                border-top-color: #714B67;
                border-radius: 50%;
                z-index: 2000;
                pointer-events: none;
                animation: trigasBarcodeMenuSpin 0.8s linear infinite;
            }

            @keyframes trigasBarcodeMenuSpin {
                to { transform: rotate(360deg); }
            }

            body.trigas-barcode-main-menu-screen .o_kanban_view {
                padding: 10px 10px 10px 10px !important;
                align-content: flex-start !important;
                justify-content: flex-start !important;
                min-height: auto !important;
            }

            body.trigas-barcode-main-menu-screen .o_kanban_view .o_kanban_record {
                min-height: 92px !important;
                height: auto !important;
                margin: 0 0 10px 0 !important;
                padding: 10px 12px !important;
                border: 1px solid #d0d0d0 !important;
                box-shadow: none !important;
            }

            body.trigas-barcode-main-menu-screen .o_kanban_view .o_kanban_record:empty,
            body.trigas-barcode-main-menu-screen .o_kanban_view .o_kanban_record:not(:has(button)):not(:has(a.btn)):not(:has(.btn)) {
                display: none !important;
                height: 0 !important;
                min-height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                border: 0 !important;
            }

            body.trigas-barcode-main-menu-screen .o_kanban_view .o_kanban_record .o_kanban_record_title,
            body.trigas-barcode-main-menu-screen .o_kanban_view .o_kanban_record .o_kanban_record_title span,
            body.trigas-barcode-main-menu-screen .o_kanban_view .o_kanban_record .o_kanban_record_title strong,
            body.trigas-barcode-main-menu-screen .o_kanban_view .o_kanban_record strong {
                font-size: 18px !important;
                font-weight: 900 !important;
                line-height: 1.2 !important;
                margin-bottom: 7px !important;
            }

            body.trigas-barcode-main-menu-screen .o_kanban_view .o_kanban_record button,
            body.trigas-barcode-main-menu-screen .o_kanban_view .o_kanban_record .btn,
            body.trigas-barcode-main-menu-screen .o_kanban_view .o_kanban_record a.btn {
                min-height: 48px !important;
                height: 48px !important;
                width: 100% !important;
                font-size: 18px !important;
                font-weight: 900 !important;
                padding: 9px 10px !important;
            }

            body.trigas-barcode-main-menu-screen .o_kanban_view .o_kanban_record button *,
            body.trigas-barcode-main-menu-screen .o_kanban_view .o_kanban_record .btn * {
                font-size: 18px !important;
                font-weight: 900 !important;
            }
        `;

        document.head.appendChild(style);
    }

    function run() {
        injectStableMenuCss();
        applyBarcodeMenuClass();
    }

    if (!window.__trigasBarcodeMainMenuFinalStarted) {
        window.__trigasBarcodeMainMenuFinalStarted = true;

        // Reaccionar al instante cuando Odoo monta/actualiza el contenido de
        // la acción (en lugar de esperar al siguiente ciclo del intervalo),
        // para detectar la pantalla de operaciones apenas aparece en el DOM
        // y aplicar el estado "pending"/estilo final sin demora visible.
        let rafScheduled = false;
        function scheduleRun() {
            if (rafScheduled) {
                return;
            }
            rafScheduled = true;
            window.requestAnimationFrame(function () {
                rafScheduled = false;
                run();
            });
        }

        const observer = new MutationObserver(scheduleRun);
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        }

        // Detectar la intención de navegar al menú de operaciones lo antes
        // posible: por el texto "Operaciones" (breadcrumb / enlace de
        // regreso) estando ya dentro del PDA, o por el href/atributos del
        // elemento (icono de la app, entradas de menú) que apunten a
        // action=407 / menu_id=246 incluso viniendo de fuera del PDA.
        // Se usa "mousedown" (antes que "click") y fase de captura para
        // ganarle tiempo al router de Odoo y cerrar la ventana de carrera
        // que dejaba pintar un primer frame con el estilo por defecto.
        function looksLikeBarcodeMenuTarget(el) {
            if (!el) {
                return false;
            }

            const href = normalizeText(
                (el.getAttribute && (el.getAttribute('href') || el.getAttribute('data-menu-xmlid'))) || ''
            );
            if (href.includes('action=407') || href.includes('menu_id=246')) {
                return true;
            }

            if (!isBarcodeRoute()) {
                return false;
            }

            const label = normalizeText(el.innerText || el.textContent || '');
            return label.length <= 60 && label.includes('operaciones');
        }

        ['mousedown', 'click'].forEach(function (eventName) {
            document.addEventListener(eventName, function (ev) {
                const el = ev.target && ev.target.closest
                    ? ev.target.closest('a, button, .btn, [role="button"], li, span, .o_app, .o_menu_entry_lvl_1, .o_menu_entry_lvl_2')
                    : null;
                if (looksLikeBarcodeMenuTarget(el)) {
                    engagePendingNow();
                }
            }, true);
        });

        // Si la navegación ocurre por hash (atrás/adelante del navegador,
        // enlaces directos, etc.) sin pasar por un click detectado arriba,
        // levantamos la cortina apenas cambia la URL —antes de que el
        // contenido nuevo llegue a montarse— salvo que el contenido ya
        // visible corresponda a la pantalla final.
        function maybeEngagePendingForRoute() {
            if (!isBarcodeRoute()) {
                return;
            }

            const text = normalizeText(document.body ? (document.body.innerText || '') : '');
            const alreadyReady = (
                text.includes('transferencias internas') ||
                text.includes('entrega a camion') ||
                text.includes('entrega a cliente') ||
                text.includes('recogida de cilindros')
            );

            if (!alreadyReady) {
                engagePendingNow();
            }
        }

        setInterval(run, 700);
        window.addEventListener('hashchange', function () {
            maybeEngagePendingForRoute();
            run();
        });
        window.addEventListener('popstate', function () {
            maybeEngagePendingForRoute();
            run();
        });

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run);
        } else {
            run();
        }

        console.log('TRIGAS PDA: MENU CODIGO DE BARRAS VISUAL FINAL UNICO activo');
    }
})();






/* TRIGAS TRI3 - Clic directo en registro de lista Recogida de Cilindros */
(function () {
    if (window.__trigasTri3DirectClickStarted) return;
    window.__trigasTri3DirectClickStarted = true;

    function isTri3ListScreen() {
        const text = (document.body ? document.body.innerText : '').toLowerCase();
        const hash = (window.location.hash || '').toLowerCase();
        return (
            text.includes('recogida de cilind') &&
            !text.includes('wh/tri3/') &&
            (hash.includes('menu_id=246') || hash.includes('action='))
        );
    }

    document.addEventListener('click', function (ev) {
        if (!isTri3ListScreen()) return;

        const row = ev.target && ev.target.closest
            ? ev.target.closest('.o_data_row, .o_kanban_record')
            : null;
        if (!row) return;

        // Buscar el id del picking en el row
        const link = row.querySelector('a[href]');
        if (link && link.href) {
            ev.preventDefault();
            ev.stopPropagation();
            // Navegar directo al barcode client action
            const match = link.href.match(/active_id=(\d+)/);
            if (match) {
                const pickingId = match[1];
                window.location.href = '/web#action=stock_barcode.action_stock_picking_type_kanban_jsid&active_id=' + pickingId + '&menu_id=246';
                return;
            }
            window.location.href = link.href;
        }
    }, true);

    console.log('TRIGAS TRI3: clic directo en lista activo');
})();


/* TRIGAS REGLA 1 — TRI1: redirigir a Pantalla de Operaciones tras validar */
(function () {
    if (window.__trigasTri1PostValidateNavStarted) return;
    window.__trigasTri1PostValidateNavStarted = true;

    document.addEventListener('click', function (event) {
        if (!document.body) return;
        if (!(document.body.innerText || '').includes('WH/TRI1/')) return;

        var btn = event.target && event.target.closest
            ? event.target.closest('button, a, .btn')
            : null;
        if (!btn) return;

        var txt = (btn.innerText || btn.textContent || '').trim().toLowerCase();
        if (!txt.includes('validar')) return;

        // Evitar instalar listener duplicado si el click es el segundo (allow-after-save)
        if (window.__trigasTri1HashChangePending) return;
        window.__trigasTri1HashChangePending = true;

        function onTri1Validated() {
            window.removeEventListener('hashchange', onTri1Validated);
            clearTimeout(cleanupTri1Timer);
            window.__trigasTri1HashChangePending = false;
            trigasGoToOperaciones();
        }
        window.addEventListener('hashchange', onTri1Validated);
        var cleanupTri1Timer = setTimeout(function () {
            window.removeEventListener('hashchange', onTri1Validated);
            window.__trigasTri1HashChangePending = false;
        }, 8000);
    }, true);

    console.log('TRIGAS REGLA 1: TRI1 post-validate navigation activo');
})();


/* TRIGAS REGLA 2 — Auto-NUEVO en TRI1 y TRI3 si la Lista de Pickings está vacía */
(function () {
    if (window.__trigasAutoNuevoStarted) return;
    window.__trigasAutoNuevoStarted = true;

    function trigasNormalizeText(text) {
        return String(text || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '');
    }

    function trigasIsListScreenForAutoNuevo() {
        if (!document.body) return false;
        var text = trigasNormalizeText(document.body.innerText || '');
        var isDetail = !!document.querySelector('.o_barcode_client_action');
        if (isDetail) return false;

        // La creación automática ya se maneja desde backend en stock_picking_type.py.
        // No usar clicks simulados sobre el botón nativo Nuevo.
        return false;
    }

    function trigasAutoNuevoIfEmpty() {
        // Contar solo tarjetas con estado procesable (Preparado, Listo, A PROCESAR)
        // Los Borradores se ignoran intencionalmente
        var allCards = document.querySelectorAll('.o_kanban_record');
        var readyCards = Array.prototype.filter.call(allCards, function (card) {
            if (card.classList.contains('o_kanban_ghost')) return false;
            var cardText = trigasNormalizeText(card.innerText || card.textContent || '');
            return cardText.includes('preparado') ||
                   cardText.includes('listo') ||
                   cardText.includes('a procesar');
        });

        if (readyCards.length > 0) {
            // Hay pickings procesables → quedarse en la lista
            return;
        }

        // Lista vacía → buscar botón NUEVO y hacer click
        var allBtns = document.querySelectorAll('button, a, .btn');
        var nuevoBtn = null;
        for (var i = 0; i < allBtns.length; i++) {
            var btnText = trigasNormalizeText(allBtns[i].innerText || allBtns[i].textContent || '').trim();
            if (btnText === 'nuevo') {
                nuevoBtn = allBtns[i];
                break;
            }
        }

        if (nuevoBtn) {
            nuevoBtn.click();
        }
    }

    // MutationObserver: detecta cuando Odoo monta la lista TRI1/TRI3 en el DOM
    // (Odoo 16 usa el router OWL/pushState, no hashchange)
    var observer = new MutationObserver(function (mutations, obs) {
        console.log('TRIGAS OBS mutation detected, childList:', mutations.length);
        console.log('TRIGAS OBS body text snippet:', document.body.innerText.substring(0, 200).toLowerCase().replace(/\s+/g, ' '));
        console.log('TRIGAS OBS has barcode action:', !!document.querySelector('.o_barcode_client_action'));
        console.log('TRIGAS OBS trigasIsListScreenForAutoNuevo:', trigasIsListScreenForAutoNuevo());
        if (!trigasIsListScreenForAutoNuevo()) return;

        // Desconectar para no repetir en el mismo montaje
        obs.disconnect();

        setTimeout(function () {
            trigasAutoNuevoIfEmpty();
            // Reconectar para detectar futuras navegaciones a esta pantalla
            setTimeout(function () {
                obs.observe(document.body, { childList: true, subtree: true });
            }, 1500);
        }, 600);
    });

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    console.log('TRIGAS REGLA 2: auto NUEVO en TRI1/TRI3 via MutationObserver activo');
})();



/* TRIGAS REGLA GLOBAL — Al validar cualquier picking Barcode, volver a Pantalla de Operaciones */
(function () {
    if (window.__trigasGlobalPostValidateToOperationsStarted) return;
    window.__trigasGlobalPostValidateToOperationsStarted = true;

    function trigasLooksLikeBarcodePickingScreen() {
        if (!document.body) return false;

        const text = (document.body.innerText || '').toUpperCase();
        const hasBarcodeAction = !!document.querySelector('.o_barcode_client_action');

        return hasBarcodeAction && (
            text.includes('WH/INT/') ||
            text.includes('WH/TRI1/') ||
            text.includes('WH/TRI2/') ||
            text.includes('WH/TRI3/')
        );
    }

    function trigasIsValidateButton(btn) {
        if (!btn) return false;

        const txt = (btn.innerText || btn.textContent || '').trim().toLowerCase();
        const cls = (btn.className || '').toString().toLowerCase();

        return txt.includes('validar') || cls.includes('o_validate_page');
    }

    function trigasScheduleGoToOperacionesAfterValidate() {
        if (window.__trigasGlobalPostValidatePending) return;
        window.__trigasGlobalPostValidatePending = true;

        let redirected = false;

        function trigasStillOnBarcodePicking() {
            if (!document.body) return false;

            const text = (document.body.innerText || '').toUpperCase();
            const hasBarcodeAction = !!document.querySelector('.o_barcode_client_action');

            return hasBarcodeAction && (
                text.includes('WH/INT/') ||
                text.includes('WH/TRI1/') ||
                text.includes('WH/TRI2/') ||
                text.includes('WH/TRI3/')
            );
        }

        function finishRedirect() {
            if (redirected) return;
            redirected = true;

            window.removeEventListener('hashchange', finishRedirect);
            clearInterval(fastWatcher);
            clearTimeout(fallbackTimer);
            clearTimeout(cleanupTimer);

            window.__trigasGlobalPostValidatePending = false;

            trigasGoToOperaciones();
        }

        // Si Odoo cambia hash, volver de una vez.
        window.addEventListener('hashchange', finishRedirect);

        // Detector rápido: cuando Odoo salga del picking Barcode y caiga en lista,
        // volvemos a Operaciones casi inmediato.
        var fastWatcher = setInterval(function () {
            if (!trigasStillOnBarcodePicking()) {
                finishRedirect();
            }
        }, 120);

        // Fallback corto por si no hay hashchange.
        var fallbackTimer = setTimeout(function () {
            finishRedirect();
        }, 900);

        // Limpieza de seguridad por si Odoo bloqueó la validación por error/modal.
        var cleanupTimer = setTimeout(function () {
            window.removeEventListener('hashchange', finishRedirect);
            clearInterval(fastWatcher);
            window.__trigasGlobalPostValidatePending = false;
        }, 9000);
    }

    document.addEventListener('click', function (event) {
        if (!trigasLooksLikeBarcodePickingScreen()) return;

        const btn = event.target && event.target.closest
            ? event.target.closest('button, a, .btn')
            : null;

        if (!trigasIsValidateButton(btn)) return;

        console.log('TRIGAS GLOBAL: validar detectado, programando retorno a Operaciones.');

        // No detenemos el click. Dejamos que Odoo valide normalmente.
        trigasScheduleGoToOperacionesAfterValidate();
    }, true);

    console.log('TRIGAS GLOBAL: post-validar hacia Pantalla de Operaciones activo.');
})();


/* TRIGAS FIX SEGURO - Limpiar estado visual TRI3 fuera de Recogida */
(function () {
    if (window.__trigasTri3SafeCleanupOutsideStarted) return;
    window.__trigasTri3SafeCleanupOutsideStarted = true;

    function isTri3BarcodeScreen() {
        if (!document.body) return false;
        const text = document.body.innerText || '';
        return !!document.querySelector('.o_barcode_client_action') && text.includes('WH/TRI3/');
    }

    function cleanupTri3VisualStateOutside() {
        if (!document.body) return;

        if (isTri3BarcodeScreen()) return;

        document.body.classList.remove(
            'trigas-tri3-active',
            'trigas-tri3-pending-signature',
            'trigas-tri3-signed'
        );

        const signWrapper = document.getElementById('trigas_tri3_frontend_signature_button_wrapper');
        if (signWrapper) {
            signWrapper.remove();
        }

        const cancelWrapper = document.getElementById('trigas_tri3_cancel_button');
        if (cancelWrapper) {
            cancelWrapper.remove();
        }
    }

    setInterval(cleanupTri3VisualStateOutside, 250);

    document.addEventListener('click', function () {
        setTimeout(cleanupTri3VisualStateOutside, 50);
        setTimeout(cleanupTri3VisualStateOutside, 250);
        setTimeout(cleanupTri3VisualStateOutside, 700);
    }, true);

    window.addEventListener('hashchange', function () {
        setTimeout(cleanupTri3VisualStateOutside, 50);
        setTimeout(cleanupTri3VisualStateOutside, 250);
    });

    console.log('TRIGAS FIX SEGURO: limpieza visual TRI3 fuera de pantalla activa.');
})();


/* TRIGAS INT - Visual exclusivo para Transferencias Internas */
(function () {
    if (window.__trigasInternalTransferVisualStarted) return;
    window.__trigasInternalTransferVisualStarted = true;

    function ensureInternalTransferStyle() {
        if (document.getElementById('trigas-internal-transfer-visual-style')) return;

        const style = document.createElement('style');
        style.id = 'trigas-internal-transfer-visual-style';
        style.textContent = `
            body.trigas-int-active .o_barcode_client_action .o_add_line {
                display: none !important;
            }

            body.trigas-int-active .o_barcode_client_action .o_barcode_line {
                min-height: 112px !important;
                padding: 14px 12px !important;
                font-size: 16px !important;
                border-radius: 10px !important;
            }

            body.trigas-int-active .o_barcode_client_action .o_barcode_line .o_line_title,
            body.trigas-int-active .o_barcode_client_action .o_barcode_line .o_product_label,
            body.trigas-int-active .o_barcode_client_action .o_barcode_line .o_barcode_line_title {
                font-size: 17px !important;
                font-weight: 800 !important;
                line-height: 1.25 !important;
            }

            body.trigas-int-active .o_barcode_client_action .o_barcode_line .o_barcode_scanner_qty,
            body.trigas-int-active .o_barcode_client_action .o_barcode_line .qty-done,
            body.trigas-int-active .o_barcode_client_action .o_barcode_line .o_qty_done {
                font-size: 17px !important;
                font-weight: 800 !important;
            }

            body.trigas-int-active .o_barcode_client_action .o_validate_page {
                min-height: 46px !important;
                height: 46px !important;
                width: 100% !important;
                border-radius: 0 !important;
                font-size: 15px !important;
                font-weight: 900 !important;
                background-color: #198754 !important;
                border-color: #198754 !important;
                color: #ffffff !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                box-shadow: none !important;
            }

            body.trigas-int-active .o_barcode_client_action .o_validate_page:before {
                font-weight: 900 !important;
            }
        `;
        document.head.appendChild(style);
    }

    function isInternalTransferBarcodeScreen() {
        if (!document.body) return false;

        const text = (document.body.innerText || '').toUpperCase();
        const hasBarcode = !!document.querySelector('.o_barcode_client_action');

        return hasBarcode && text.includes('WH/INT/');
    }

    function syncInternalTransferVisual() {
        if (!document.body) return;

        ensureInternalTransferStyle();

        if (isInternalTransferBarcodeScreen()) {
            document.body.classList.add('trigas-int-active');
        } else {
            document.body.classList.remove('trigas-int-active');
        }
    }

    setInterval(syncInternalTransferVisual, 300);

    document.addEventListener('click', function () {
        setTimeout(syncInternalTransferVisual, 50);
        setTimeout(syncInternalTransferVisual, 250);
        setTimeout(syncInternalTransferVisual, 700);
    }, true);

    window.addEventListener('hashchange', function () {
        setTimeout(syncInternalTransferVisual, 50);
        setTimeout(syncInternalTransferVisual, 250);
    });

    console.log('TRIGAS INT: visual transferencia interna activo.');
})();

/* TRIGAS INT list clean removido: causaba parpadeo en kanban */


/* TRIGAS INT - Limpieza visual segura de lista sin pelear con Odoo */
(function () {
    if (window.__trigasInternalListSafeVisualStarted) return;
    window.__trigasInternalListSafeVisualStarted = true;

    function injectCss() {
        if (document.getElementById('trigas-int-list-safe-visual-css')) return;

        const style = document.createElement('style');
        style.id = 'trigas-int-list-safe-visual-css';
        style.textContent = `
            body.trigas-int-list-safe-active .o_kanban_record .o_priority,
            body.trigas-int-list-safe-active .o_kanban_record .o_priority_star,
            body.trigas-int-list-safe-active .o_kanban_record .fa-star,
            body.trigas-int-list-safe-active .o_kanban_record .fa-star-o,
            body.trigas-int-list-safe-active .o_kanban_record .fa-desktop,
            body.trigas-int-list-safe-active .o_kanban_record .fa-clock,
            body.trigas-int-list-safe-active .o_kanban_record .fa-clock-o,
            body.trigas-int-list-safe-active .o_kanban_record .fa-user,
            body.trigas-int-list-safe-active .o_kanban_record .o_activity,
            body.trigas-int-list-safe-active .o_kanban_record .o_kanban_activity,
            body.trigas-int-list-safe-active .o_kanban_record .o_mail_activity,
            body.trigas-int-list-safe-active .o_kanban_record .o_field_activity,
            body.trigas-int-list-safe-active .o_kanban_record .o_field_many2one_avatar_user,
            body.trigas-int-list-safe-active .o_kanban_record .o_field_many2one_avatar,
            body.trigas-int-list-safe-active .o_kanban_record .o_kanban_avatar,
            body.trigas-int-list-safe-active .o_kanban_record img.o_avatar {
                display: none !important;
                visibility: hidden !important;
            }

            body.trigas-int-list-safe-active .o_kanban_record {
                min-height: 70px !important;
                padding: 12px 14px !important;
                cursor: pointer !important;
            }

            body.trigas-int-list-safe-active .o_kanban_record strong,
            body.trigas-int-list-safe-active .o_kanban_record .o_kanban_record_title,
            body.trigas-int-list-safe-active .o_kanban_record .oe_kanban_details {
                font-size: 15px !important;
                font-weight: 800 !important;
            }

            body.trigas-int-list-safe-active .o_kanban_record .badge,
            body.trigas-int-list-safe-active .o_kanban_record .o_badge {
                display: inline-flex !important;
                visibility: visible !important;
            }
        `;
        document.head.appendChild(style);
    }

    function isIntList() {
        if (!document.body) return false;

        const text = (document.body.innerText || '').toLowerCase();

        return !document.querySelector('.o_barcode_client_action') &&
            !!document.querySelector('.o_kanban_view') &&
            text.includes('transferencias internas') &&
            text.includes('wh/int/');
    }

    function sync() {
        injectCss();

        const active = isIntList();
        const hasClass = document.body.classList.contains('trigas-int-list-safe-active');

        if (active && !hasClass) {
            document.body.classList.add('trigas-int-list-safe-active');
        } else if (!active && hasClass) {
            document.body.classList.remove('trigas-int-list-safe-active');
        }
    }

    let timer = null;
    function scheduleSync() {
        clearTimeout(timer);
        timer = setTimeout(sync, 120);
    }

    const observer = new MutationObserver(scheduleSync);

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
        sync();
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            observer.observe(document.body, { childList: true, subtree: true });
            sync();
        });
    }

    window.addEventListener('hashchange', scheduleSync);

    console.log('TRIGAS INT: limpieza visual segura de lista activa.');
})();


/* TRIGAS INT - Botón flotante pequeño para cancelar transferencia interna */
(function () {
    if (window.__trigasInternalCancelButtonStarted) return;
    window.__trigasInternalCancelButtonStarted = true;

    function getPickingId() {
        const hash = String(window.location.hash || '');
        const match = hash.match(/active_id=(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    }

    function isInternalTransferBarcodeScreen() {
        if (!document.body) return false;

        const text = (document.body.innerText || '').toUpperCase();
        const hasBarcode = !!document.querySelector('.o_barcode_client_action');

        return hasBarcode && text.includes('WH/INT/');
    }

    function removeCancelButton() {
        const existing = document.getElementById('trigas_int_cancel_floating_button');
        if (existing) {
            existing.remove();
        }
    }

    function ensureCancelButton() {
        if (!isInternalTransferBarcodeScreen()) {
            removeCancelButton();
            return;
        }

        if (document.getElementById('trigas_int_cancel_floating_button')) {
            return;
        }

        const btn = document.createElement('button');
        btn.id = 'trigas_int_cancel_floating_button';
        btn.type = 'button';
        btn.textContent = 'Cancelar';

        btn.style.position = 'fixed';
        btn.style.right = '12px';
        btn.style.bottom = '62px';
        btn.style.zIndex = '160000';
        btn.style.padding = '7px 11px';
        btn.style.border = 'none';
        btn.style.borderRadius = '16px';
        btn.style.background = '#dc3545';
        btn.style.color = '#ffffff';
        btn.style.fontSize = '12px';
        btn.style.fontWeight = '800';
        btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';
        btn.style.opacity = '0.92';

        btn.onclick = async function (event) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            const pickingId = getPickingId();
            if (!pickingId) {
                alert('No pude identificar el traslado activo.');
                return;
            }

            const bodyText = document.body ? (document.body.innerText || '') : '';
            const nameMatch = bodyText.match(/WH\/INT\/\d+/i);
            const pickingName = nameMatch ? nameMatch[0] : ('Picking #' + pickingId);

            if (!window.confirm('Cancelar la transferencia ' + pickingName + '?')) {
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Cancelando...';

            try {
                const response = await fetch('/web/dataset/call_kw/stock.picking/action_cancel', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'call',
                        params: {
                            model: 'stock.picking',
                            method: 'action_cancel',
                            args: [[pickingId]],
                            kwargs: {},
                        },
                        id: Date.now(),
                    }),
                });

                const data = await response.json();

                if (data.error) {
                    throw data.error;
                }

                removeCancelButton();

                if (typeof trigasGoToOperaciones === 'function') {
                    trigasGoToOperaciones();
                } else {
                    window.history.back();
                }
            } catch (error) {
                console.log('TRIGAS INT: error cancelando transferencia interna', error);
                btn.disabled = false;
                btn.textContent = 'Cancelar';
                alert('No se pudo cancelar la transferencia. Intente de nuevo.');
            }
        };

        document.body.appendChild(btn);
    }

    let timer = null;
    function scheduleSync() {
        clearTimeout(timer);
        timer = setTimeout(ensureCancelButton, 120);
    }

    const observer = new MutationObserver(scheduleSync);

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
        ensureCancelButton();
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            observer.observe(document.body, { childList: true, subtree: true });
            ensureCancelButton();
        });
    }

    window.addEventListener('hashchange', scheduleSync);

    console.log('TRIGAS INT: botón cancelar flotante activo.');
})();
