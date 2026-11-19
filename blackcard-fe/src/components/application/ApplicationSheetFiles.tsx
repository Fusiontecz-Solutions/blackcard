import UploadedDocuments from "./UploadedDocuments"

type ApplicationSheetFilesProps = {
    applicationId: string
    /** OPERATIONS: view/download only (no upload or delete). */
    readOnly?: boolean
}

export default function ApplicationSheetFiles({ applicationId, readOnly = false }: ApplicationSheetFilesProps) {
    
    return (
        <div className="space-y-4">
            <UploadedDocuments applicationId={applicationId} readOnly={readOnly} />
        </div>
    )
}    