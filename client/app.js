const messageEl = document.getElementById('m') || createMessageEl();

function createMessageEl() {
    const el = document.createElement('div');
    el.id = 'm';
    el.style.cssText = 'padding:10px;margin:10px 0;border-radius:4px;display:none;';
    document.body.insertBefore(el, document.querySelector('textarea'));
    return el;
}

function showMessage(text, type = 'info') {
    messageEl.textContent = text;
    messageEl.style.backgroundColor = type === 'error' ? '#fee' : type === 'success' ? '#efe' : '#eef';
    messageEl.style.color = type === 'error' ? '#c33' : type === 'success' ? '#3c3' : '#33c';
    messageEl.style.display = 'block';
    setTimeout(() => messageEl.style.display = 'none', 5000);
}

async function g() {
    const prompt = p.value.trim();
    if (!prompt) {
        showMessage('Please describe the change you want to make', 'error');
        return;
    }

    try {
        showMessage('Generating preview...');
        const response = await fetch('/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(error.detail || response.statusText);
        }

        showMessage('Preview ready! Check the iframe below.', 'success');
        reload();
    } catch (e) {
        showMessage(`Error: ${e.message}`, 'error');
        console.error('Generate error:', e);
    }
}

async function u() {
    try {
        showMessage('Publishing changes...');
        const response = await fetch('/publish', { method: 'POST' });

        if (!response.ok) {
            throw new Error(response.statusText);
        }

        showMessage('Published successfully!', 'success');
        load();
        reload();
    } catch (e) {
        showMessage(`Error: ${e.message}`, 'error');
        console.error('Publish error:', e);
    }
}

async function load() {
    try {
        const response = await fetch('/history');
        if (!response.ok) throw new Error(response.statusText);
        const h = await response.json();
        v.innerHTML = '<option value="">Select version to rollback...</option>' +
                      h.map(x => `<option value="${x}">${x}</option>`).join('');
    } catch (e) {
        console.error('History load error:', e);
    }
}

async function r() {
    const version = v.value;
    if (!version) {
        showMessage('Please select a version', 'error');
        return;
    }

    try {
        showMessage('Rolling back...');
        const response = await fetch('/rollback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ version })
        });

        if (!response.ok) {
            throw new Error(response.statusText);
        }

        showMessage('Rollback successful!', 'success');
        reload();
        load();
    } catch (e) {
        showMessage(`Error: ${e.message}`, 'error');
        console.error('Rollback error:', e);
    }
}

function reload() {
    document.querySelector('iframe').src = '/site/live.html?t=' + Date.now();
}

load();
