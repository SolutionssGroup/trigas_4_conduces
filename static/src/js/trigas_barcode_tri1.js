/** @odoo-module **/

/*
 * TRIGAS - TRI1 Entrega a Camion
 * Este archivo contendra unicamente la logica del flujo /TRI1/.
 * Fase C: primeros bloques TRI1 migrados sin cambiar comportamiento.
 */

window.TrigasBarcodeTri1 = window.TrigasBarcodeTri1 || {};

(function (Tri1) {
    "use strict";

    Tri1.trigasTri1IsActive = function trigasTri1IsActive() {
        const text = document.body ? (document.body.innerText || '') : '';
        const href = window.location.href || '';
        const hash = window.location.hash || '';
        return (
            href.includes('/TRI1/') ||
            hash.includes('/TRI1/') ||
            text.includes('/TRI1/')
        );
    };

    Tri1.trigasTri1ScanLogKey = function trigasTri1ScanLogKey(deps = {}) {
        const pickingId = typeof deps.getPickingId === 'function' ? deps.getPickingId() : 'unknown';
        return 'trigas_tri1_scan_log_' + pickingId;
    };

    Tri1.trigasTri1GetScanLog = function trigasTri1GetScanLog(deps = {}) {
        const key = Tri1.trigasTri1ScanLogKey(deps);
        try {
            return JSON.parse(window.sessionStorage.getItem(key) || '[]');
        } catch (e) {
            return [];
        }
    };

    Tri1.trigasTri1SetScanLog = function trigasTri1SetScanLog(items, deps = {}) {
        const key = Tri1.trigasTri1ScanLogKey(deps);
        window.sessionStorage.setItem(key, JSON.stringify(items || []));
    };

    Tri1.trigasTri1AddScanLog = function trigasTri1AddScanLog() {
        // TRI1 ya no muestra historial de lecturas. La lista visible se reconstruye
        // desde los seriales seleccionados reales del picking.
        Tri1.trigasTri1RenderScanLog();
    };

    Tri1.trigasTri1ClearScanLog = function trigasTri1ClearScanLog(deps = {}) {
        Tri1.trigasTri1SetScanLog([], deps);
        Tri1.trigasTri1RenderScanLog();
    };

    Tri1.trigasTri1RenderScanLog = function trigasTri1RenderScanLog() {
        document.querySelectorAll('.trigas-tri1-scan-log-box').forEach((box) => box.remove());
    };
})(window.TrigasBarcodeTri1);
