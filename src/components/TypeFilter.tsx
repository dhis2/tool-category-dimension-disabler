import i18n from '@dhis2/d2-i18n'
import { SingleSelectField, SingleSelectOption } from '@dhis2/ui'
import React from 'react'
import { DIMENSION_TYPES } from '../dimensionTypes'
import { TypeFilterValue } from './usageTableUtils'

type Props = {
    value: TypeFilterValue
    onChange: (value: TypeFilterValue) => void
}

export const TypeFilter = ({ value, onChange }: Props) => (
    <SingleSelectField
        dataTest="type-filter"
        label={i18n.t('Dimension type')}
        selected={value}
        onChange={({ selected }) => onChange(selected as TypeFilterValue)}
        inputWidth="320px"
        dense
    >
        <SingleSelectOption value="ALL" label={i18n.t('All types')} />
        {DIMENSION_TYPES.map((type) => (
            <SingleSelectOption
                key={type.key}
                value={type.key}
                label={type.getLabel()}
            />
        ))}
    </SingleSelectField>
)
