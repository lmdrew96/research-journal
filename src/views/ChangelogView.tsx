import MarkdownPreview from '../components/common/MarkdownPreview';
// The repo's CHANGELOG.md, bundled as text. One entry per version, added with
// every bump; scripts/check-changelog.mts fails the build if one is missing.
import changelog from '../../CHANGELOG.md?raw';

/** Strips the file's own title and intro — the view header says the same thing. */
const entries = changelog.slice(changelog.indexOf('## '));

export default function ChangelogView(): React.ReactElement {
  return (
    <div className="main-inner">
      <div className="view-header">
        <div className="view-header-label">ThreadNotes v{__APP_SEMVER__}</div>
        <h1 className="view-header-title">What's new</h1>
        <p className="view-header-subtitle">
          What changed in each version, newest first. Patch versions are fixes; minor versions are new
          features.
        </p>
      </div>
      <div className="changelog">
        <MarkdownPreview content={entries} />
      </div>
    </div>
  );
}
