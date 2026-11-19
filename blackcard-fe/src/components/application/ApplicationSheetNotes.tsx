import MyNotes from "./MyNotes"

type ApplicationSheetNotesProps = {
    applicationId: string
}

export default function ApplicationSheetNotes({ applicationId }: ApplicationSheetNotesProps) {
    return (
        <div className="space-y-4">
            <MyNotes applicationId={applicationId} />
        </div>
    )
}    