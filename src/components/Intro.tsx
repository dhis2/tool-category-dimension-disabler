import i18n from '@dhis2/d2-i18n'
import React from 'react'
import classes from './Intro.module.css'

export const Intro = () => (
    <details className={classes.intro} open>
        <summary>{i18n.t('About this tool')}</summary>
        <p>
            {i18n.t(
                'Categories, organisation unit group sets, data element group sets and category option group sets can be enabled as data dimensions. Enabled dimensions appear in the analytics apps, where they can be used to disaggregate data. Each enabled dimension adds a column to the analytics tables, which costs time during analytics generation and disk space.'
            )}
        </p>
        <p>
            {i18n.t(
                'The table ranks every enabled dimension by how often favorites (visualizations, maps, event visualizations) that use it were opened in the last 12 months. "% of dimension views" is the share of all such views; "% of favorite views" compares against all favorite views, including favorites that use no dimension.'
            )}
        </p>
        <p>
            {i18n.t(
                'Dimensions with no or very few views are candidates for disabling. Favorites that use a disabled dimension stop working, and section forms lose their subtotals for it, so check before disabling. A dimension can be re-enabled at any time in the Maintenance app. Try changes on a test system first.'
            )}
        </p>
    </details>
)
