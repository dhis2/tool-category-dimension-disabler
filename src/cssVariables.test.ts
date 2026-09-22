import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

/**
 * The DHIS2 design tokens (`--spacers-*`, `--colors-*`, ...) only exist in the
 * document when the app renders `<CssVariables>`; the app-platform shell does
 * not render it. A stylesheet that uses a section nobody enables silently
 * loses every declaration that references it, which is invisible to jsdom.
 */
const SRC_DIR = __dirname

const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
            return sourceFiles(path)
        }
        return /\.(css|tsx?)$/.test(entry.name) &&
            !entry.name.includes('.test.')
            ? [path]
            : []
    })

const sectionsUsedIn = (path: string): string[] =>
    [...readFileSync(path, 'utf8').matchAll(/var\(--([a-z]+)-/g)].map(
        (match) => match[1]
    )

describe('DHIS2 CSS variables', () => {
    const usedSections = [
        ...new Set(sourceFiles(SRC_DIR).flatMap(sectionsUsedIn)),
    ].sort()

    const enabledSections = (
        readFileSync(join(SRC_DIR, 'App.tsx'), 'utf8').match(
            /<CssVariables([^/>]*)\/>/
        )?.[1] ?? ''
    )
        .trim()
        .split(/\s+/)
        .filter(Boolean)

    it('finds the sections the stylesheets depend on', () => {
        expect(usedSections).toContain('spacers')
        expect(usedSections).toContain('colors')
    })

    it('enables every section the app styles reference', () => {
        expect(enabledSections.sort()).toEqual(usedSections)
    })
})
