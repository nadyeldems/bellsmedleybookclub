import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Library from './pages/Library'
import BookDetail from './pages/BookDetail'
import AddBook from './pages/AddBook'

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-yellow-50">
      <Navbar />
      <main className="pt-20">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/library" element={<Library />} />
          <Route path="/books/:id" element={<BookDetail />} />
          <Route path="/add" element={<AddBook />} />
        </Routes>
      </main>
    </div>
  )
}
