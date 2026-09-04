import { FormEvent, useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2, UploadCloud } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { Button, LoadingState, Notice, SectionHeading } from '@/components/primitives';

type MediaAsset = {
  id: number;
  filename: string;
  mimeType: string;
  byteSize: number;
  altText: string | null;
  caption: string | null;
  visibility: string;
  createdAt: string;
  url: string;
};

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export default function Media() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [dataUrl, setDataUrl] = useState('');
  const [altText, setAltText] = useState('');
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setAssets(await customFetch<MediaAsset[]>('/media', { responseType: 'json' }));
      setError('');
    } catch {
      setError('Your picture library could not be loaded. Refresh and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const chooseFile = (candidate: File | undefined) => {
    if (!candidate) return;
    if (!ACCEPTED_TYPES.has(candidate.type) || candidate.size > MAX_BYTES) {
      setError('Choose a JPEG, PNG, WebP, or GIF image no larger than 5 MB.');
      setFile(null);
      setDataUrl('');
      return;
    }
    setError('');
    setFile(candidate);
    setAltText((current) => current || candidate.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
    const reader = new FileReader();
    reader.onload = () => setDataUrl(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(candidate);
  };

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !dataUrl) {
      setError('Choose a picture before uploading.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await customFetch<MediaAsset>('/media', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          data: dataUrl,
          altText: altText.trim() || null,
          caption: caption.trim() || null,
          visibility,
        }),
        responseType: 'json',
      });
      setFile(null);
      setDataUrl('');
      setAltText('');
      setCaption('');
      setVisibility('private');
      if (inputRef.current) inputRef.current.value = '';
      setMessage('Picture saved to your tenant-owned library.');
      await load();
    } catch {
      setError('The picture could not be saved. Check the file type and size, then try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm('Delete this picture from the library?')) return;
    try {
      await customFetch(`/media/${id}`, { method: 'DELETE', responseType: 'text' });
      setAssets((current) => current.filter((asset) => asset.id !== id));
      setMessage('Picture deleted.');
    } catch {
      setError('The picture could not be deleted.');
    }
  };

  return <AppShell>
    <div className="mx-auto max-w-[1100px]">
      <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a2772e]">Tenant-owned media</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em] md:text-4xl">Upload pictures once. Reuse them everywhere.</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#697687]">Pictures are validated before they are saved to your workspace. Private images stay behind your sign-in; public images can be reused in approved storefront content.</p>
      {message && <div className="mt-6"><Notice tone="success" title="Picture library updated">{message}</Notice></div>}
      {error && <div className="mt-6"><Notice tone="danger" title="Picture action failed">{error}</Notice></div>}

      <section className="mt-8 rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6] p-6 md:p-8">
        <SectionHeading eyebrow="New picture" title="Add a picture" description="JPEG, PNG, WebP, or GIF. Maximum size: 5 MB." />
        <form onSubmit={upload} className="grid gap-5 lg:grid-cols-[240px_1fr]">
          <button type="button" onClick={() => inputRef.current?.click()} className="group grid min-h-[220px] place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-[#cfc7b8] bg-[#f7f4ed] text-center hover:border-[#c85d3f]" aria-label="Choose a picture">
            {dataUrl ? <img src={dataUrl} alt={altText || 'Selected preview'} className="h-full max-h-[220px] w-full object-cover" /> : <span><ImagePlus className="mx-auto h-9 w-9 text-[#a2772e]" /><span className="mt-3 block text-sm font-extrabold text-[#182333]">Choose picture</span><span className="mt-1 block text-xs text-[#697687]">No browser-only save</span></span>}
          </button>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(event) => chooseFile(event.target.files?.[0])} />
          <div className="space-y-4">
            <label className="block text-sm font-bold">Alt text<input value={altText} onChange={(event) => setAltText(event.target.value)} maxLength={160} required className={inputClass} placeholder="Describe the picture for customers" /></label>
            <label className="block text-sm font-bold">Caption <span className="font-normal text-[#697687]">(optional)</span><textarea value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={500} rows={3} className={`${inputClass} h-auto py-3`} placeholder="Add context for this picture" /></label>
            <label className="block text-sm font-bold">Visibility<select value={visibility} onChange={(event) => setVisibility(event.target.value as 'private' | 'public')} className={inputClass}><option value="private">Private — workspace only</option><option value="public">Public — safe to reuse in published content</option></select></label>
            <div className="flex items-center justify-between gap-3"><p className="text-xs text-[#697687]">{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Choose a file to begin.'}</p><Button type="submit" disabled={saving || !file}><UploadCloud className="h-4 w-4" />{saving ? 'Saving…' : 'Save picture'}</Button></div>
          </div>
        </form>
      </section>

      <section className="mt-8">
        <SectionHeading eyebrow="Library" title="Your saved pictures" description="Delete an asset when it is no longer needed. Historical commerce records do not depend on this library." />
        {loading ? <LoadingState label="Loading picture library" /> : assets.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{assets.map((asset) => <article key={asset.id} className="overflow-hidden rounded-2xl border border-[#d9d2c4] bg-[#fbfaf6]"><img src={asset.url} alt={asset.altText ?? asset.filename} className="aspect-[4/3] w-full object-cover bg-[#f7f4ed]" /><div className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-extrabold">{asset.filename}</p><p className="mt-1 text-xs text-[#697687]">{asset.visibility === 'public' ? 'Public' : 'Private'} · {(asset.byteSize / 1024 / 1024).toFixed(2)} MB</p></div><div className="flex items-center gap-1"><button type="button" onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}${asset.url}`); setMessage('Picture URL copied.'); }} className="rounded-lg px-2 py-1 text-[11px] font-extrabold text-[#8a6826] hover:bg-[#f7edd2]">Copy URL</button><button type="button" onClick={() => void remove(asset.id)} className="rounded-lg p-2 text-[#a33e38] hover:bg-[#fff3f0]" aria-label={`Delete ${asset.filename}`}><Trash2 className="h-4 w-4" /></button></div></div>{asset.caption && <p className="mt-3 text-xs leading-5 text-[#697687]">{asset.caption}</p>}</div></article>)}</div> : <div className="rounded-2xl border border-dashed border-[#cfc7b8] bg-[#f7f4ed] px-6 py-12 text-center text-sm text-[#697687]">No pictures yet. Upload your first customer-safe asset above.</div>}
      </section>
    </div>
  </AppShell>;
}

const inputClass = 'mt-2 h-11 w-full rounded-lg border border-[#d9d2c4] bg-[#f7f4ed] px-3 text-sm outline-none focus:border-[#bca26a] focus:ring-2 focus:ring-[#d6aa46]/20';