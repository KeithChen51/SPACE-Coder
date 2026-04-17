import fs from 'fs';
import path from 'path';

export const SCHEMA_VERSION = '1.1.0';

export const PHASE_GRAPH = {
    'C+B': {
        0: [1],
        1: [3],
        3: [4],
        4: [5],
        5: [6],
        6: []
    },
    '纯B': {
        0: [1],
        1: [3],
        3: [4],
        4: []
    }
};

export function nowTimestamp() {
    const current = new Date();
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, '0');
    const dd = String(current.getDate()).padStart(2, '0');
    const hh = String(current.getHours()).padStart(2, '0');
    const mi = String(current.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export function resolveHostDir(hostDir) {
    if (!hostDir) {
        throw new Error('missing required flag --host-dir');
    }
    return path.resolve(hostDir);
}

export function getPagePreviewDir(hostDir) {
    return path.join(resolveHostDir(hostDir), 'page-preview');
}

export function getScreenshotsDir(hostDir) {
    return path.join(getPagePreviewDir(hostDir), 'screenshots');
}

export function findLedger(hostDir) {
    const previewDir = getPagePreviewDir(hostDir);
    if (!fs.existsSync(previewDir)) {
        return null;
    }

    const matches = fs.readdirSync(previewDir)
        .filter((name) => /^page-ledger-.*\.json$/.test(name))
        .sort();

    if (matches.length === 0) {
        return null;
    }

    if (matches.length > 1) {
        throw new Error(`multiple page ledgers found under ${previewDir}`);
    }

    return path.join(previewDir, matches[0]);
}

export function findBrd(hostDir) {
    const absoluteHostDir = resolveHostDir(hostDir);
    const docsBrdDir = path.join(absoluteHostDir, 'docs', 'brd');
    const docsMatches = listBrdFiles(docsBrdDir);
    if (docsMatches.length > 0) {
        return path.join(docsBrdDir, docsMatches.at(-1));
    }

    const rootMatches = listBrdFiles(absoluteHostDir);
    if (rootMatches.length > 0) {
        return path.join(absoluteHostDir, rootMatches.at(-1));
    }

    return null;
}

function listBrdFiles(targetDir) {
    if (!fs.existsSync(targetDir)) {
        return [];
    }

    return fs.readdirSync(targetDir)
        .filter((name) => /^BRD-.*\.md$/.test(name))
        .sort();
}

export function deriveSlugFromBrd(brdPath) {
    const fileName = path.basename(brdPath);
    const timestampMatch = fileName.match(/^BRD-(.+)-\d{8}-\d{4}\.md$/);
    if (timestampMatch) {
        return timestampMatch[1];
    }

    const genericMatch = fileName.match(/^BRD-(.+)\.md$/);
    if (genericMatch) {
        return genericMatch[1];
    }

    throw new Error(`unable to derive slug from BRD filename: ${fileName}`);
}

export function getLedgerPath(hostDir, slug) {
    return path.join(getPagePreviewDir(hostDir), `page-ledger-${slug}.json`);
}

export function readLedger(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        throw new Error(`ledger not found: ${filePath}`);
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeLedger(filePath, data) {
    const outputDir = path.dirname(filePath);
    fs.mkdirSync(outputDir, { recursive: true });

    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    fs.renameSync(tempPath, filePath);
}

export function isValidAdvance(from, to, routePath) {
    if (from === to) {
        return true;
    }

    if (!routePath || !PHASE_GRAPH[routePath]) {
        return false;
    }

    return PHASE_GRAPH[routePath][from]?.includes(to) ?? false;
}

export function buildNewLedger(hostDir, brdFile) {
    const slug = deriveSlugFromBrd(brdFile);
    const timestamp = nowTimestamp();
    return {
        schemaVersion: SCHEMA_VERSION,
        slug,
        path: null,
        brdFile,
        screenshotAsked: false,
        screenshotDir: getScreenshotsDir(hostDir),
        phase: 0,
        loopRound: 0,
        gapFilesConsumed: [],
        entitiesApproved: false,
        createdAt: timestamp,
        updatedAt: timestamp
    };
}

export function getEntitiesFilePath(hostDir, slug) {
    return path.join(getPagePreviewDir(hostDir), `page-spec-entities-${slug}.md`);
}

export function getDeliveryFilePath(hostDir, slug) {
    return path.join(getPagePreviewDir(hostDir), `page-delivery-${slug}.md`);
}

export function parsePhase(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
        throw new Error(`invalid phase: ${value}`);
    }
    return parsed;
}

export function buildAdvanceCheck(ledger, hostDir, toPhase) {
    if (ledger.phase === toPhase) {
        return { canAdvance: true, reason: 'already_at_target_phase', error: null };
    }

    if (toPhase === 1) {
        if (!ledger.path) {
            return { canAdvance: false, reason: 'path is not set', error: 'precondition_failed' };
        }
        if (ledger.screenshotAsked !== true) {
            return { canAdvance: false, reason: 'screenshot has not been asked', error: 'precondition_failed' };
        }
    }

    if (!ledger.path) {
        return { canAdvance: false, reason: 'path is not set', error: 'precondition_failed' };
    }

    if (!isValidAdvance(ledger.phase, toPhase, ledger.path)) {
        return {
            canAdvance: false,
            reason: `invalid transition from ${ledger.phase} to ${toPhase} for path ${ledger.path}`,
            error: 'invalid_transition'
        };
    }

    if (toPhase === 4 && ledger.path === 'C+B') {
        const entitiesFile = getEntitiesFilePath(hostDir, ledger.slug);
        if (!fs.existsSync(entitiesFile)) {
            return {
                canAdvance: false,
                reason: `entities file is missing: ${entitiesFile}`,
                error: 'precondition_failed'
            };
        }
        if (ledger.entitiesApproved !== true) {
            return {
                canAdvance: false,
                reason: 'entities file has not been approved by user',
                error: 'precondition_failed'
            };
        }
    }

    if ((toPhase === 4 && ledger.path === '纯B') || toPhase === 6) {
        const deliveryFile = getDeliveryFilePath(hostDir, ledger.slug);
        if (!fs.existsSync(deliveryFile)) {
            return {
                canAdvance: false,
                reason: `delivery file is missing: ${deliveryFile}`,
                error: 'precondition_failed'
            };
        }
    }

    return { canAdvance: true, reason: 'ok', error: null };
}

export function getDeliveryPhase(routePath) {
    return routePath === 'C+B' ? 6 : routePath === '纯B' ? 4 : null;
}

export function parseGapFiles(raw) {
    if (!raw) {
        return [];
    }
    return raw.split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => path.resolve(item));
}
