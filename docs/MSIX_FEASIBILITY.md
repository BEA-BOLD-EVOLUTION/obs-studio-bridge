# Microsoft Store MSIX feasibility test

This branch contains an experimental Windows MSIX package. It does not replace the
current Inno Setup installer and is not approved for public distribution.

## What the test proves

- The desktop companion can run as a packaged, full-trust desktop application.
- Runtime state, pairing data, and the DPAPI-protected bridge token are written to
  the package's per-user `LocalState` directory instead of the read-only install directory.
- The package can declare a disabled-by-default startup task without silently enabling it.
- GitHub Actions can create an MSIX and a temporary development certificate without
  storing a signing private key in the repository or workflow artifact.

## The decisive OBS plugin test

The native plugin payload is placed under the package's `VFS\Common AppData` path.
Windows normally exposes package virtualization only to processes in that package.
OBS Studio is an external, unpackaged process, so it is expected **not** to discover
the plugin from this location. This build makes that limitation testable rather than
assuming that MSIX can perform the same machine-wide copy as the existing installer.

Acceptance requires one of these outcomes:

1. OBS discovers and loads the packaged plugin without a manual copy or elevation; or
2. Microsoft confirms that a narrowly scoped, creator-approved integration mechanism
   is acceptable for Store certification.

If neither outcome is available, a Store MSIX cannot provide the complete one-click
OBS plugin experience, and the existing installer will still require trusted signing.

## Private test procedure

1. Run the **MSIX feasibility** workflow and download its private artifact.
2. On a dedicated test computer, import only the included public `.cer` into
   **Local Computer → Trusted People**. Do not import it into Trusted Root Authorities.
3. Install `OBS-Creator-Assistant-MSIX-Test.msix` and launch it from Start.
4. Confirm the first-run setup opens and that the local companion starts.
5. Close and reopen OBS, then check **Docks** for OBS Creator Assistant and review the OBS log.
6. Uninstall the test package and remove the temporary certificate from Trusted People.

The included certificate is generated for one workflow run, has no public trust, and
must never be presented as a creator-facing release certificate.

For a local build, `build-msix.ps1` also accepts `-PfxPath`. The certificate is read
from its existing location, its subject is placed into the package manifest, and only
the public `.cer` is exported beside the MSIX. The PFX and private key are never copied
into the layout or output. This option intentionally supports only a passwordless local
test PFX; public releases must use the Microsoft Store or the approved release signer.
