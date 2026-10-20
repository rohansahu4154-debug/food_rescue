
import { useEffect, useState } from 'react'

const API_URL = 'http://localhost:8000'

function App() {
  const [apiStatus, setApiStatus] = useState('Checking...')

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('API unavailable')
        }
        return response.json()
      })
      .then((data) => setApiStatus(data.status))
      .catch(() => setApiStatus('Disconnected'))
  }, [])

  return (
    <main className="min-h-screen bg-green-50">
      <nav className="bg-green-700 p-5 text-white">
        <h1 className="text-2xl font-bold">
          Food Rescue
        </h1>
      </nav>

      <section className="mx-auto max-w-5xl p-8 text-center">
        <h2 className="mt-12 text-4xl font-bold text-green-800">
          Rescue Food. Feed Communities.
        </h2>

        <p className="mt-5 text-lg text-gray-600">
          Connecting surplus food from events and
          restaurants with people who need it.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-xl bg-white p-8 shadow">
            <h3 className="text-2xl font-semibold">
              Bulk Food Rescue
            </h3>
            <p className="mt-3 text-gray-600">
              Connect event surplus with verified
              NGOs and government schools.
            </p>
          </div>

          <div className="rounded-xl bg-white p-8 shadow">
            <h3 className="text-2xl font-semibold">
              Restaurant Stock Clearance
            </h3>
            <p className="mt-3 text-gray-600">
              Discover leftover meals at a
              mandatory 20% discount.
            </p>
          </div>
        </div>

        <div className="mt-10 rounded-lg bg-white p-4 shadow">
          Backend API status:
          <strong className="ml-2 text-green-700">
            {apiStatus}
          </strong>
        </div>
      </section>
    </main>
  )
}

export default App