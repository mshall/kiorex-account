// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../src/i18n';
import { Alert, ConfirmDialog, DraftNote, Field, Dialog, Button, Ltr } from '../src/ui';
import { a11yViolations } from './harness';

const wrap = (ui: React.ReactElement, lang: 'ar' | 'en' = 'en') => render(<I18nProvider initial={lang}>{ui}</I18nProvider>);

describe('ui primitives', () => {
  it('Field wires label, hint and error to the control (aria-describedby / aria-invalid / role=alert)', () => {
    wrap(<Field label="Name" hint="Shown to clinics" error="Required">{(p) => <input {...p} />}</Field>);
    const input = screen.getByLabelText('Name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const described = input.getAttribute('aria-describedby')!.split(' ').map((id) => document.getElementById(id)!.textContent);
    expect(described).toEqual(['Shown to clinics', 'Required']);
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });

  it('Alert uses role=alert for errors and role=status otherwise', () => {
    wrap(<><Alert kind="error">bad</Alert><Alert kind="success">good</Alert></>);
    expect(screen.getByRole('alert')).toHaveTextContent('bad');
    expect(screen.getByRole('status')).toHaveTextContent('good');
  });

  it('DraftNote flags NEEDS_HUMAN copy visibly and machine-readably, in both languages', () => {
    const { container, unmount } = wrap(<DraftNote k="draft.deletion" />);
    expect(container.querySelector('[data-needs-human="deletion"]')).toHaveTextContent(/Draft wording, pending legal review/);
    unmount();
    const ar = wrap(<DraftNote k="draft.deletion" />, 'ar');
    expect(ar.container.querySelector('[data-needs-human="deletion"]')).toHaveTextContent('صياغة مبدئية');
  });

  it('Dialog: labelled modal, focuses first control, Escape closes, Tab stays inside, focus returns', async () => {
    const onClose = vi.fn();
    const trigger = document.createElement('button'); document.body.appendChild(trigger); trigger.focus();
    wrap(<Dialog title="Sure?" onClose={onClose}><button>One</button><button>Two</button></Dialog>);
    const dlg = screen.getByRole('dialog', { name: 'Sure?' });
    expect(dlg).toHaveAttribute('aria-modal', 'true');
    expect(document.activeElement).toBe(screen.getByLabelText('Close')); // first focusable
    const user = userEvent.setup();
    await user.tab(); await user.tab(); await user.tab(); // One, Two, then wraps back inside the dialog
    expect(dlg.contains(document.activeElement)).toBe(true);
    await user.tab({ shift: true }); await user.tab({ shift: true }); await user.tab({ shift: true }); await user.tab({ shift: true });
    expect(dlg.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    trigger.remove();
  });

  it('ConfirmDialog: cancel and confirm callbacks, danger styling, busy disables confirm', async () => {
    const onConfirm = vi.fn(); const onCancel = vi.fn();
    const { rerender } = wrap(<ConfirmDialog title="Remove?" body="Really" confirmLabel="Remove" danger onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onConfirm).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove' })).toHaveClass('btn-danger');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    rerender(<I18nProvider initial="en"><ConfirmDialog title="Remove?" confirmLabel="Remove" busy onConfirm={onConfirm} onCancel={onCancel} /></I18nProvider>);
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
  });

  it('Button marks itself busy for assistive tech; Ltr isolates latin tokens', () => {
    wrap(<><Button busy>Save</Button><Ltr>+201000000001</Ltr></>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('+201000000001')).toHaveAttribute('dir', 'ltr');
  });

  it('sets lang/dir on <html> from the language (Arabic default => RTL)', () => {
    wrap(<p>x</p>, 'ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(document.documentElement).toHaveAttribute('lang', 'ar');
  });

  it('a composed form has no axe violations in English and Arabic', async () => {
    for (const lang of ['en', 'ar'] as const) {
      const { container, unmount } = wrap(
        <main><h1>Title</h1><form><Field label="Phone" hint="International format">{(p) => <input {...p} type="tel" />}</Field><Button type="submit">Go</Button></form><DraftNote k="draft.consent" /></main>, lang);
      expect(await a11yViolations(container)).toEqual([]);
      unmount();
    }
  });
});
