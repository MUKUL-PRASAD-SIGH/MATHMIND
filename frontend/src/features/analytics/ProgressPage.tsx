import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, type Schemas } from '../../services/api/client'
import { describeError } from '../ai-review/reviewStore'
import { RECOMMENDED_ACTION } from '../ai-review/annotations'
import { PrivacyPanel } from '../privacy/PrivacyPanel'
import { findProblem, startPractice } from './practice'

type Entry = Schemas['MasteryEntry']

const CONFIDENCE: Record<Schemas['ConfidenceLevel'], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

function lastPractised(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

type Load<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; data: T }

function useLoad<T>(fetcher: () => Promise<T>): Load<T> {
  const [value, setValue] = useState<Load<T>>({ state: 'loading' })
  useEffect(() => {
    let live = true
    fetcher().then(
      (data) => live && setValue({ state: 'ok', data }),
      (err: unknown) => live && setValue({ state: 'error', message: describeError(err) }),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per mount
  }, [])
  return value
}

/** Mastery per concept (an estimate, never a grade), a table of the details and what to do next. */
export function ProgressPage() {
  const mastery = useLoad(api.mastery)
  const next = useLoad(api.next)
  const [practiceError, setPracticeError] = useState<string | null>(null)

  const practise = async (action: Schemas['NextAction']) => {
    setPracticeError(null)
    try {
      const problem = action.problem_id
        ? await findProblem(action.problem_id, action.concept_id)
        : null
      if (!problem) return setPracticeError('That problem is not in the problem bank.')
      await startPractice(problem)
    } catch (err) {
      setPracticeError(describeError(err))
    }
  }

  if (mastery.state === 'loading') return <p className="p-6">Loading your progress…</p>
  if (mastery.state === 'error') {
    return (
      <p role="alert" className="p-6 text-red-700">
        {mastery.message}
      </p>
    )
  }

  const items: Entry[] = mastery.data.items
  const data = items.map((e) => ({ name: e.concept_name, mastery: Math.round(e.mastery * 100) }))

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4">
      <h2 className="text-lg font-semibold">Your progress</h2>

      {items.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-slate-700 shadow-sm">
          No practice yet — try a problem to see your progress.
        </p>
      ) : (
        <>
          <section aria-labelledby="mastery-chart" className="rounded-lg bg-white p-4 shadow-sm">
            <h3 id="mastery-chart" className="mb-2 font-medium">
              Mastery by concept{' '}
              <span className="text-sm font-normal text-slate-500">(estimate)</span>
            </h3>
            <div className="h-56 w-full sm:h-72" data-testid="mastery-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => [`${String(v)}% (estimate)`, 'Mastery']} />
                  <Bar
                    dataKey="mastery"
                    fill="#2563eb"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Screen readers and tests get the same numbers as text. */}
            <ul className="sr-only" aria-label="Mastery estimates">
              {data.map((d) => (
                <li key={d.name}>{`${d.name}: ${d.mastery}% (estimate)`}</li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="mastery-table" className="rounded-lg bg-white p-4 shadow-sm">
            <h3 id="mastery-table" className="mb-2 font-medium">
              Details
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="text-slate-600">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Concept</th>
                    <th className="py-1 pr-3 font-medium">Attempts</th>
                    <th className="py-1 pr-3 font-medium">Confidence</th>
                    <th className="py-1 font-medium">Last practised</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e) => (
                    <tr key={e.concept_id} className="border-t">
                      <td className="py-1.5 pr-3">{e.concept_name}</td>
                      <td className="py-1.5 pr-3">{e.attempts}</td>
                      <td className="py-1.5 pr-3">{CONFIDENCE[e.confidence_level]}</td>
                      <td className="py-1.5">{lastPractised(e.last_practised_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {next.state === 'ok' && (
        <section
          aria-labelledby="next-up"
          className="rounded-lg border border-blue-200 bg-blue-50 p-4"
          data-testid="next-up"
        >
          <h3 id="next-up" className="font-medium text-blue-900">
            Next up
          </h3>
          <p className="text-blue-900">{RECOMMENDED_ACTION[next.data.action]}</p>
          <p className="text-sm text-blue-800">
            {items.find((e) => e.concept_id === next.data.concept_id)?.concept_name ??
              next.data.concept_id.replace(/_/g, ' ')}
            {' — '}
            {next.data.reason}
          </p>
          {next.data.problem_id && (
            <button
              type="button"
              onClick={() => void practise(next.data)}
              className="mt-2 min-h-9 rounded bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
            >
              Practise this problem
            </button>
          )}
          {practiceError && (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {practiceError}
            </p>
          )}
        </section>
      )}
      <PrivacyPanel />
    </div>
  )
}
