/** @odoo-module **/

/*
 * TRIGAS - TRI2 Entrega a Cliente
 * Este archivo contendra unicamente la logica del flujo WH/TRI2/.
 * Lista visual de seriales leidos en la sesion PDA.
 */

function tri2GetPickingId() {
    const match = String(window.location.hash || '').match(/active_id=(\d+)/);
    return match ? Number(match[1]) : 0;
}

function tri2SessionKey() {
    const pickingId = tri2GetPickingId();
    return pickingId ? 'trigas_tri2_session_serials_' + pickingId : false;
}

function tri2OpenKey() {
    const pickingId = tri2GetPickingId();
    return pickingId ? 'trigas_tri2_session_serials_open_' + pickingId : false;
}

function tri2NormalizeSerialItems(items) {
    return (Array.isArray(items) ? items : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean);
}

function tri2GetCounterSerials() {
    if (typeof window.trigasTempGetSerials !== 'function') {
        return false;
    }

    return tri2NormalizeSerialItems(window.trigasTempGetSerials());
}

function tri2SetCounterSerials(serials) {
    if (typeof window.trigasTempSetSerials === 'function') {
        window.trigasTempSetSerials(serials);
    }
}

function tri2SameSerials(left, right) {
    left = tri2NormalizeSerialItems(left);
    right = tri2NormalizeSerialItems(right);

    if (left.length !== right.length) {
        return false;
    }

    return left.every((serial, index) => serial === right[index]);
}

function tri2GetSessionSerials() {
    const key = tri2SessionKey();
    if (!key) {
        return [];
    }

    const counterSerials = tri2GetCounterSerials();
    if (counterSerials !== false) {
        let storedSerials = [];
        try {
            storedSerials = tri2NormalizeSerialItems(JSON.parse(window.sessionStorage.getItem(key) || '[]'));
        } catch (error) {
            storedSerials = [];
        }
        if (!tri2SameSerials(storedSerials, counterSerials)) {
            tri2SetSessionSerials(counterSerials);
        }
        return counterSerials;
    }

    try {
        return tri2NormalizeSerialItems(JSON.parse(window.sessionStorage.getItem(key) || '[]'));
    } catch (error) {
        return [];
    }
}

function tri2SetSessionSerials(serials) {
    const key = tri2SessionKey();
    if (!key) {
        return;
    }

    const cleanSerials = [];
    for (const serial of tri2NormalizeSerialItems(serials)) {
        if (!cleanSerials.includes(serial)) {
            cleanSerials.push(serial);
        }
    }

    window.sessionStorage.setItem(key, JSON.stringify(cleanSerials));
    tri2SetCounterSerials(cleanSerials);
}

function tri2IsScreen() {
    const text = document.body ? (document.body.innerText || '') : '';
    return (
        !!document.querySelector('.o_barcode_client_action') &&
        (
            text.includes('WH/TRI2/') ||
            text.includes('Conduce 2') ||
            text.includes('CLIENTES_TRIGAS/')
        )
    );
}

function tri2FindProductLine() {
    const root = document.querySelector('.o_barcode_client_action');
    return root ? root.querySelector('.o_barcode_line') : null;
}

function tri2GetExpectedQtyFromScreen() {
    const root = document.querySelector('.o_barcode_client_action');
    if (!root) {
        return 0;
    }

    const text = root.innerText || '';
    const labelled = text.match(/(?:Le[ií]dos|Seriales le[ií]dos)\s*:\s*\d+\s*\/\s*(\d+)/i);
    if (labelled && labelled[1]) {
        return Number(labelled[1]);
    }

    const generic = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (generic && generic[2]) {
        return Number(generic[2]);
    }

    return 0;
}

function tri2IsOpen(forceExpanded = false) {
    if (forceExpanded) {
        return true;
    }

    const key = tri2OpenKey();
    return key ? window.sessionStorage.getItem(key) === '1' : false;
}

function tri2SetOpen(isOpen) {
    const key = tri2OpenKey();
    if (key) {
        window.sessionStorage.setItem(key, isOpen ? '1' : '0');
    }
}

function tri2EnsureStyle() {
    if (document.getElementById('trigas-tri2-session-serials-style')) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'trigas-tri2-session-serials-style';
    style.textContent = `
        .trigas-tri2-session-serials {
            margin: 8px 0;
            border: 1px solid #d0d7de;
            border-radius: 8px;
            background: #fff;
            overflow: hidden;
        }
        .trigas-tri2-session-serials-header {
            width: 100%;
            border: 0;
            background: #f6f8fa;
            color: #24292f;
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 9px 10px;
            font-weight: 800;
            text-align: left;
        }
        .trigas-tri2-session-serials-title {
            flex: 1;
        }
        .trigas-tri2-session-serials-body {
            border-top: 1px solid #d0d7de;
            padding: 8px 10px;
        }
        .trigas-tri2-session-serial-row {
            padding: 4px 0;
            font-weight: 700;
            color: #1f2328;
        }
        .trigas-tri2-session-serials-empty {
            color: #6e7781;
            font-weight: 600;
        }
    `;
    document.head.appendChild(style);
}

function tri2RenderSessionSerials(options = {}) {
    if (!tri2IsScreen()) {
        return false;
    }

    const productLine = tri2FindProductLine();
    if (!productLine) {
        return false;
    }

    tri2EnsureStyle();

    const serials = tri2GetSessionSerials();
    const expectedQty = options.expectedQty || tri2GetExpectedQtyFromScreen();
    const isOpen = tri2IsOpen(!!options.forceExpanded);

    let card = productLine.parentElement && productLine.parentElement.querySelector('.trigas-tri2-session-serials');
    if (!card) {
        card = document.createElement('div');
        card.className = 'trigas-tri2-session-serials';
        productLine.parentNode.insertBefore(card, productLine.nextSibling);
    }

    card.innerHTML = '';
    card.dataset.open = isOpen ? '1' : '0';

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'trigas-tri2-session-serials-header';

    const arrow = document.createElement('span');
    arrow.className = 'trigas-tri2-session-serials-arrow';
    arrow.textContent = isOpen ? '▾' : '▸';

    const title = document.createElement('span');
    title.className = 'trigas-tri2-session-serials-title';
    title.textContent = 'Seriales leídos: ' + serials.length + ' / ' + (expectedQty || '?');

    header.appendChild(arrow);
    header.appendChild(title);
    header.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        tri2SetOpen(card.dataset.open !== '1');
        tri2RenderSessionSerials({ expectedQty });
    });
    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'trigas-tri2-session-serials-body';
    body.style.display = isOpen ? 'block' : 'none';

    if (!serials.length) {
        const empty = document.createElement('div');
        empty.className = 'trigas-tri2-session-serials-empty';
        empty.textContent = 'Todavía no hay seriales leídos.';
        body.appendChild(empty);
    } else {
        for (const serial of serials) {
            const row = document.createElement('div');
            row.className = 'trigas-tri2-session-serial-row';
            row.textContent = serial;
            body.appendChild(row);
        }
    }

    card.appendChild(body);
    return true;
}

function tri2CanAcceptSerial(serialName, expectedQty) {
    const serials = tri2GetSessionSerials();

    if (serials.includes(serialName)) {
        return {
            ok: false,
            message: 'El serial ' + serialName + ' ya fue leído.',
        };
    }

    if (expectedQty && serials.length >= expectedQty) {
        return {
            ok: false,
            message: 'Ya se leyeron los ' + expectedQty + ' seriales esperados.',
        };
    }

    return { ok: true };
}

function tri2RecordSerial(serialName, options = {}) {
    serialName = String(serialName || '').trim();
    if (!serialName) {
        return [];
    }

    const expectedQty = options.expectedQty || tri2GetExpectedQtyFromScreen();
    const serials = tri2GetSessionSerials();
    if (!serials.includes(serialName)) {
        serials.push(serialName);
    }
    tri2SetSessionSerials(serials);
    tri2RenderSessionSerials({ expectedQty, forceExpanded: !!options.forceExpanded });
    return serials;
}

window.TrigasBarcodeTri2 = {
    isScreen: tri2IsScreen,
    getExpectedQty: tri2GetExpectedQtyFromScreen,
    getSessionSerials: tri2GetSessionSerials,
    setSessionSerials: tri2SetSessionSerials,
    canAcceptSerial: tri2CanAcceptSerial,
    recordSerial: tri2RecordSerial,
    renderSessionSerials: tri2RenderSessionSerials,
};

setInterval(() => {
    if (window.TrigasBarcodeTri2 && window.TrigasBarcodeTri2.isScreen()) {
        window.TrigasBarcodeTri2.renderSessionSerials();
    }
}, 700);
