import i18n from '@dhis2/d2-i18n'
import React from 'react'
import classes from './App.module.css'

const App = () => (
    <div className={classes.container}>
        <h1>{i18n.t('Data Dimension Disabler')}</h1>
    </div>
)

export default App
