import { describe, it, expect } from 'vitest';
import {
  buildSubject,
  buildBody,
  diagnosticLines,
  mailtoUrl,
  toClipboardText,
  MAX_SUMMARY,
  type FeedbackContext,
} from './feedback';

const ctx: FeedbackContext = {
  version: '1.10.0',
  step: '3. Schedule',
  groups: 3,
  players: 28,
  sessionActive: true,
  courts: 3,
  rounds: 8,
  largeText: false,
  userAgent: 'Mozilla/5.0 (iPhone) Safari/605.1',
  screen: '390x844',
  language: 'en-US',
};

describe('buildSubject', () => {
  it('prefixes by kind', () => {
    expect(buildSubject('feature', 'Add a timer')).toBe('[Feature] Add a timer');
    expect(buildSubject('bug', 'Wrong sit-outs')).toBe('[Bug] Wrong sit-outs');
  });

  it('collapses whitespace and trims', () => {
    expect(buildSubject('bug', '  two   spaces  ')).toBe('[Bug] two spaces');
  });

  it('caps a long summary so the mailto stays under client limits', () => {
    const subject = buildSubject('bug', 'x'.repeat(500));
    expect(subject.length).toBe('[Bug] '.length + MAX_SUMMARY);
  });
});

describe('diagnosticLines', () => {
  it('gives a feature only the version and screen', () => {
    expect(diagnosticLines(ctx, 'feature')).toEqual([
      'Version: 1.10.0',
      'Screen: 3. Schedule',
    ]);
  });

  it('gives a bug the full picture', () => {
    const lines = diagnosticLines(ctx, 'bug');
    expect(lines).toContain('Groups: 3');
    expect(lines).toContain('Players: 28');
    expect(lines).toContain('Session running: yes');
    expect(lines).toContain('Courts / rounds: 3 / 8');
    expect(lines).toContain('Large text: off');
    expect(lines).toContain('Window: 390x844');
    expect(lines.some((l) => l.startsWith('Browser: Mozilla'))).toBe(true);
  });
});

describe('buildBody', () => {
  it('leads with the summary under a kind-specific heading', () => {
    expect(buildBody('feature', 'Add a timer', '', ctx)).toContain('The idea');
    expect(buildBody('bug', 'It broke', '', ctx)).toContain('What happened');
  });

  it('includes the summary, the details, and the app block', () => {
    const body = buildBody('bug', 'Wrong sit-outs', 'I removed Sue,\nthen round 3 broke.', ctx);
    expect(body).toContain('Wrong sit-outs');
    expect(body).toContain('I removed Sue,\nthen round 3 broke.');
    expect(body).toContain('--- app details ---');
    expect(body).toContain('Version: 1.10.0');
  });

  it('omits the details section entirely when it is blank', () => {
    const body = buildBody('feature', 'Add a timer', '   ', ctx);
    expect(body).not.toMatch(/\n\n\n/);
  });

  it('keeps browser details out of a feature suggestion', () => {
    expect(buildBody('feature', 'Add a timer', '', ctx)).not.toContain('Browser:');
  });
});

describe('mailtoUrl', () => {
  it('encodes characters that would truncate or split the mail', () => {
    const url = mailtoUrl('to@example.com', '[Bug] A & B #3', 'line one\nline two');
    expect(url).toContain('%23'); // # would otherwise start a URL fragment
    expect(url).toContain('%26'); // & would otherwise start a new header
    expect(url).toContain('%0A'); // newline survives
    expect(url).not.toMatch(/[#]/);
  });

  it('keeps the address readable and the params in order', () => {
    expect(mailtoUrl('a@b.com', 'S', 'B')).toBe('mailto:a@b.com?subject=S&body=B');
  });
});

describe('toClipboardText', () => {
  it('reads as a message someone could paste anywhere', () => {
    expect(toClipboardText('a@b.com', '[Bug] X', 'Body here')).toBe(
      'To: a@b.com\nSubject: [Bug] X\n\nBody here'
    );
  });
});
