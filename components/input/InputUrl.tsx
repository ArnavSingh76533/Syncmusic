import { ReactNode, useId } from "react"
import { X } from "lucide-react"
import { isUrl } from "../../lib/utils"
interface Props {
  url: string
  placeholder: string
  tooltip: string
  onSubmit?: () => void
  onChange: (value: string) => void
  className?: string
  children?: ReactNode
}
export default function InputUrl({
  url,
  placeholder,
  tooltip,
  onSubmit,
  onChange,
  className = "",
  children,
}: Props) {
  const id = useId()
  const valid = !!url.trim() && isUrl(url.trim())
  return (
    <form
      className={`room-url-form ${className}`}
      onSubmit={(event) => {
        event.preventDefault()
        if (valid) onSubmit?.()
      }}
    >
      <div className='room-url-field'>
        <input
          type='url'
          aria-label={placeholder}
          aria-invalid={!!url && !valid}
          aria-describedby={url && !valid ? id : undefined}
          placeholder={placeholder}
          value={url}
          onChange={(event) => onChange(event.target.value)}
        />
        {url && (
          <button
            type='button'
            className='room-url-clear'
            aria-label='Clear link'
            onClick={() => onChange("")}
          >
            <X size={15} />
          </button>
        )}
        <button type='submit' title={tooltip} disabled={!valid}>
          {children}
        </button>
      </div>
      {url && !valid && (
        <p id={id} className='room-url-error'>
          Enter a valid https:// or http:// link.
        </p>
      )}
    </form>
  )
}
