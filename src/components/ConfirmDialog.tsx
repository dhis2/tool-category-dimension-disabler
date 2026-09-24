import { FetchError } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import {
    Button,
    ButtonStrip,
    Modal,
    ModalActions,
    ModalContent,
    ModalTitle,
    NoticeBox,
} from '@dhis2/ui'
import React from 'react'

type Props = {
    title: string
    body: React.ReactNode
    confirmLabel: string
    destructive?: boolean
    loading: boolean
    error?: FetchError
    onConfirm: () => void
    onCancel: () => void
    dataTest?: string
}

export const errorMessage = (error: FetchError): string =>
    error.details?.message || error.message || i18n.t('Unknown error')

export const ConfirmDialog = ({
    title,
    body,
    confirmLabel,
    destructive = false,
    loading,
    error,
    onConfirm,
    onCancel,
    dataTest = 'confirm-dialog',
}: Props) => (
    <Modal small onClose={loading ? undefined : onCancel} dataTest={dataTest}>
        <ModalTitle>{title}</ModalTitle>
        <ModalContent>
            {body}
            {error && (
                <div style={{ marginTop: 'var(--spacers-dp12)' }}>
                    <NoticeBox error title={i18n.t('The request failed')}>
                        {errorMessage(error)}
                    </NoticeBox>
                </div>
            )}
        </ModalContent>
        <ModalActions>
            <ButtonStrip end>
                <Button secondary onClick={onCancel} disabled={loading}>
                    {i18n.t('Cancel')}
                </Button>
                <Button
                    primary={!destructive}
                    destructive={destructive}
                    onClick={onConfirm}
                    disabled={loading}
                    loading={loading}
                >
                    {confirmLabel}
                </Button>
            </ButtonStrip>
        </ModalActions>
    </Modal>
)
