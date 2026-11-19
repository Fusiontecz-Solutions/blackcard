import CommentSection from "./CommentSection"

type ApplicationSheetCommentsProps = {
    applicationId: string
}

export default function ApplicationSheetComments({ applicationId }: ApplicationSheetCommentsProps) {
    return (
        <div className="space-y-4">
            <CommentSection styles="full" applicationId={applicationId} />
        </div>
    )
}    