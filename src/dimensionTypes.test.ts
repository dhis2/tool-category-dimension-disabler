import {
    DIMENSION_TYPES,
    DIMENSION_TYPE_KEYS,
    getDimensionType,
    isDimensionTypeKey,
} from './dimensionTypes'

describe('dimensionTypes', () => {
    it('defines exactly the four dimension types in a stable order', () => {
        expect(DIMENSION_TYPE_KEYS).toEqual([
            'CATEGORY',
            'ORGUNIT_GROUP_SET',
            'DATAELEMENT_GROUP_SET',
            'CATEGORYOPTION_GROUP_SET',
        ])
        expect(DIMENSION_TYPES.map((t) => t.key)).toEqual(DIMENSION_TYPE_KEYS)
    })

    it('maps each type to its metadata API endpoint', () => {
        expect(getDimensionType('CATEGORY').endpoint).toBe('categories')
        expect(getDimensionType('ORGUNIT_GROUP_SET').endpoint).toBe(
            'organisationUnitGroupSets'
        )
        expect(getDimensionType('DATAELEMENT_GROUP_SET').endpoint).toBe(
            'dataElementGroupSets'
        )
        expect(getDimensionType('CATEGORYOPTION_GROUP_SET').endpoint).toBe(
            'categoryOptionGroupSets'
        )
    })

    it('uses the renamed category table from 2.41 on', () => {
        const category = getDimensionType('CATEGORY')
        expect(category.table(40)).toBe('dataelementcategory')
        expect(category.table(41)).toBe('category')
        expect(category.table(43)).toBe('category')
    })

    it('has SQL names for every type', () => {
        for (const type of DIMENSION_TYPES) {
            expect(type.table(43)).toMatch(/^[a-z]+$/)
            expect(type.primaryKey).toMatch(/id$/)
            expect(type.dimensionTable).toMatch(/dimension$/)
            expect(type.dimensionPrimaryKey).toBe(`${type.dimensionTable}id`)
            expect(type.joinTableSuffix).toBe(`${type.dimensionTable}s`)
            expect(type.getLabel()).not.toHaveLength(0)
        }
    })

    it('recognises valid keys', () => {
        expect(isDimensionTypeKey('CATEGORY')).toBe(true)
        expect(isDimensionTypeKey('PROGRAM')).toBe(false)
        expect(isDimensionTypeKey(undefined)).toBe(false)
    })
})
