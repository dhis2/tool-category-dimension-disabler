import i18n from '@dhis2/d2-i18n'

export type DimensionTypeKey =
    | 'CATEGORY'
    | 'ORGUNIT_GROUP_SET'
    | 'DATAELEMENT_GROUP_SET'
    | 'CATEGORYOPTION_GROUP_SET'

export type DimensionType = {
    key: DimensionTypeKey
    /** Human label; a function because i18n is not initialised at import time */
    getLabel: () => string
    /** Metadata API collection, e.g. `categories` -> PATCH /api/categories/{id} */
    endpoint: string
    /** Entity table holding uid, name, datadimension. Depends on the server minor version. */
    table: (minor: number) => string
    /** Primary key column of the entity table */
    primaryKey: string
    /** Dimension table that favorites reference, e.g. categorydimension */
    dimensionTable: string
    /** Primary key of the dimension table */
    dimensionPrimaryKey: string
    /** Column in the dimension table pointing back at the entity */
    dimensionForeignKey: string
    /** Suffix of the favorite join tables: visualization_<suffix>, mapview_<suffix>, eventvisualization_<suffix> */
    joinTableSuffix: string
}

// The category table was renamed from dataelementcategory to category in 2.41.
const categoryTable = (minor: number) =>
    minor < 41 ? 'dataelementcategory' : 'category'

export const DIMENSION_TYPES: readonly DimensionType[] = [
    {
        key: 'CATEGORY',
        getLabel: () => i18n.t('Category'),
        endpoint: 'categories',
        table: categoryTable,
        primaryKey: 'categoryid',
        dimensionTable: 'categorydimension',
        dimensionPrimaryKey: 'categorydimensionid',
        dimensionForeignKey: 'categoryid',
        joinTableSuffix: 'categorydimensions',
    },
    {
        key: 'ORGUNIT_GROUP_SET',
        getLabel: () => i18n.t('Organisation unit group set'),
        endpoint: 'organisationUnitGroupSets',
        table: () => 'orgunitgroupset',
        primaryKey: 'orgunitgroupsetid',
        dimensionTable: 'orgunitgroupsetdimension',
        dimensionPrimaryKey: 'orgunitgroupsetdimensionid',
        dimensionForeignKey: 'orgunitgroupsetid',
        joinTableSuffix: 'orgunitgroupsetdimensions',
    },
    {
        key: 'DATAELEMENT_GROUP_SET',
        getLabel: () => i18n.t('Data element group set'),
        endpoint: 'dataElementGroupSets',
        table: () => 'dataelementgroupset',
        primaryKey: 'dataelementgroupsetid',
        dimensionTable: 'dataelementgroupsetdimension',
        dimensionPrimaryKey: 'dataelementgroupsetdimensionid',
        dimensionForeignKey: 'dataelementgroupsetid',
        joinTableSuffix: 'dataelementgroupsetdimensions',
    },
    {
        key: 'CATEGORYOPTION_GROUP_SET',
        getLabel: () => i18n.t('Category option group set'),
        endpoint: 'categoryOptionGroupSets',
        table: () => 'categoryoptiongroupset',
        primaryKey: 'categoryoptiongroupsetid',
        dimensionTable: 'categoryoptiongroupsetdimension',
        dimensionPrimaryKey: 'categoryoptiongroupsetdimensionid',
        dimensionForeignKey: 'categoryoptiongroupsetid',
        joinTableSuffix: 'categoryoptiongroupsetdimensions',
    },
]

export const DIMENSION_TYPE_KEYS: readonly DimensionTypeKey[] =
    DIMENSION_TYPES.map((type) => type.key)

export const isDimensionTypeKey = (value: unknown): value is DimensionTypeKey =>
    typeof value === 'string' &&
    (DIMENSION_TYPE_KEYS as readonly string[]).includes(value)

export const getDimensionType = (key: DimensionTypeKey): DimensionType => {
    const type = DIMENSION_TYPES.find((candidate) => candidate.key === key)
    if (!type) {
        throw new Error(`Unknown dimension type ${key}`)
    }
    return type
}
