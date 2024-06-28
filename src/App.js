import './App.css'
import {
  SimplePool,
  nip19,
  nip04,
  getPublicKey,
  getEventHash
} from 'nostr-tools'
import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import { useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'

const pool = new SimplePool()
window.pool = pool
window.nip19 = nip19
window.nip04 = nip04
window.pool = pool
window.getPublicKey = getPublicKey
window.getEventHash = getEventHash

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/:npub?" element={<Page />} />
      </Routes>
    </Router>
  )
}

function Page() {
  const { npub } = useParams()
  const [pubkey, setPubkey] = useState()
  const [profile, setProfile] = useState({})
  const [followCount, setFollowCount] = useState(0)
  const [progress, setProgress] = useState(0)
  const [contacts, setContacts] = useState([])
  const [showProgress, setShowProgress] = useState()
  const [burying, setBurying] = useState()
  const [months, setMonths] = useState(3)
  const [inactive, setInactive] = useState([])
  const [cliques, setCliques] = useState([])

  window.setCliques = setCliques
  window.setInactive = setInactive

  const [relays, setRelays] = useState([
    'wss://nos.lol',
    'wss://relay.damus.io',
    'wss://nostr21.com/',
    'wss://offchain.pub',
    'wss://nostr.thank.eu',
    "wss://nostr.mom",
    // "ws://umbrel.local:4848"
  ].map(r => [r, { read: true, write: true }]))

  const writeRelays = [
    "wss://nos.lol",
    "wss://relay.damus.io",
    "wss://nostr21.com",
    "wss://offchain.pub",
    'wss://nostr.thank.eu',
    "wss://nostr.mom",
    "wss://nostr.bitcoiner.social",
    "wss://relay.nostr.bg",
    "wss://relay.nostrati.com",
    "wss://nostr.inosta.cc",
    "wss://nostr.fmt.wiz.biz",
    "wss://nostr.plebchain.org",
    "wss://relay.primal.net",
    "wss://bitcoiner.social",
    "wss://nostr.lu.ke",
    "wss://relay.stoner.com",
  ]

  window.setProgress = setProgress

  useEffect(() => {
    let pubkey = npub ? nip19.decode(npub).data : localStorage.getItem('pubkey')
    if (pubkey) {
      setPubkey(pubkey)
    } else {
      setTimeout(() => {
        if (!window.nostr) {
          alert('no nostr')
          return
        }
        window.nostr.getPublicKey()
          .then(pubkey => {
            localStorage.setItem('pubkey', pubkey)
            setPubkey(pubkey)
          }).catch(e => alert('couldnt get pubkey'))
      }, 200)
    }
  }, [npub])

  useEffect(() => {
    if (pubkey) {
      (async () => {
        await findProfile()
      })()
    }
  }, [pubkey])

  function getReadRelays() {
    return relays.filter(r => r[1].read).map(r => r[0])
  }

  function getWriteRelays() {
    return writeRelays
  }

  function getAllRelays() {
    return relays.map(r => r[0])
  }

  window.getReadRelays = getReadRelays
  window.getWriteRelays = getWriteRelays
  window.getAllRelays = getAllRelays

  async function findProfile() {
    setInactive([])
    setCliques([])
    let events = await pool.querySync(getReadRelays(), {
      kinds: [0, 3],
      authors: [pubkey]
    })
    let profile = events.filter(e => e.kind === 0)
    profile.sort((a, b) => b.created_at - a.created_at)
    profile = profile[0]
    let follows = events.filter(e => e.kind === 3)
    follows.sort((a, b) => b.created_at - a.created_at)
    follows = follows[0]
    follows = follows.tags.filter(t => t[0] === 'p').map(t => t[1])
    //follows = follows.slice(0, 5)
    // follows = [
    //   "ee11a5dff40c19a555f41fe42b48f00e618c91225622ae37b6c2bb67b76c4e49",
    //   "82456d0f84713f9c92b71b5d3108091aad058500f9c92d50db301a4a0f185b5e",
    //   "5c3ac592e4b12e62bdc7c975a2407f58484bf9c816d1c299f52f2469142ca38e",
    //   "db4e057ef8242c0aeef6c16bbc5cc235a5f31ef81f7bf92764b2551b0acf0ddf",
    //   "97b6c917552120de06220ba19bc6532a9a914f7d8cc52b5dfce0c6537f170cb5",
    //   "44dc1c2db9c3fbd7bee9257eceb52be3cf8c40baf7b63f46e56b58a131c74f0b",
    //   "2efaa715bbb46dd5be6b7da8d7700266d11674b913b8178addb5c2e63d987331",
    // ]
    follows.push(pubkey)
    setContacts(follows)
    window.follows = follows
    const followCount = follows.length
    setFollowCount(followCount)
    let c = JSON.parse(profile.content)
    c.name = c.name || c.display_name || c.displayName || c.username
    c.npub = nip19.npubEncode(pubkey)
    setProfile(c)

    let allEvents = await pool.querySync(getReadRelays(), {
      kinds: [0, 3],
      authors: follows
    })

    let profileMap = {}
    allEvents.filter(e => e.kind === 0).forEach(e => {
      let list = profileMap[e.pubkey] || []
      profileMap[e.pubkey] = list
      list.push(e)
    })
    events = Object.values(profileMap).map(list => {
      list.sort((a, b) => b.created_at - a.created_at)
      return list[0]
    })
    console.log(events)
    profileMap = {}
    events.forEach(e => {
      profileMap[e.pubkey] = createProfileRow(e)
    })
    console.log(profileMap)
    window.profileMap = profileMap

    let followMap = {}
    allEvents.filter(e => e.kind === 3).forEach(e => {
      let list = followMap[e.pubkey] || []
      followMap[e.pubkey] = list
      list.push(e)
    })

    events = Object.values(followMap).map(list => {
      list.sort((a, b) => b.created_at - a.created_at)
      return list[0]
    })
    //console.log(events)

    let followedBy = {}
    events.filter(e => profileMap[e.pubkey]).forEach(follower => {
      follower.tags.filter(t => t[0] === 'p').map(t => t[1]).forEach(followee => {
        followedBy[followee] = followedBy[followee] || new Set()
        followedBy[followee].add(follower.pubkey)
      })
    })
    window.followedBy = followedBy

    let mutuals = new Mutuals()
    const sg = new SocialGraph()

    for (let [k, v] of Object.entries(followedBy)) {
      for (let f of v) {
        mutuals.addEdge(k, f)
      }
    }
    let mc = mutuals.findMutualConnections()
    console.log('mutual', mc)
    window.mc = mc
    mc.forEach(p => {
        sg.addEdge(p[0], p[1])
    })
    const cl = sg.findCliques().sort((a, b) => b.size - a.size) // sort by size of clique in descending order 
    console.log(cl)
    window.cl = cl
    //setInactive(await loadData(follows))
    Promise.all(cl.map(item => loadData(Array.from(item)))).then(setCliques)
  }

  async function loadData(unfollow) {
    let profileMap = window.profileMap
    return unfollow.filter(p => p !== pubkey).map(p => profileMap[p])
  }
  window.loadData = loadData

  function createProfileRow(e) {
    const c = JSON.parse(e.content)
    return {
      pubkey: e.pubkey,
      name: c.name || c.display_name || c.displayName,
      picture: c.picture,
      website: c.website
    }
  }

  class Mutuals {
    constructor() {
        this.graph = new Map()
    }

    addEdge(u, v) {
        if (u === v) return
        if (!this.graph.has(u)) this.graph.set(u, new Set())
        this.graph.get(u).add(v)
    }

    findMutualConnections() {
        const mutualConnections = []
        for (let [u, neighbors] of this.graph) {
            for (let v of neighbors) {
                if (this.graph.has(v) && this.graph.get(v).has(u)) {
                    mutualConnections.push([u, v])
                }
            }
        }
        return mutualConnections
    }
  }
  window.Mutuals = Mutuals

  class SocialGraph {
    constructor() {
        this.graph = new Map()
    }

    addEdge(u, v) {
        if (!this.graph.has(u)) this.graph.set(u, new Set())
        if (!this.graph.has(v)) this.graph.set(v, new Set())
        this.graph.get(u).add(v)
        this.graph.get(v).add(u)
    }

    removeEdge(u, v) {
        if (this.graph.has(u)) this.graph.get(u).delete(v)
        if (this.graph.has(v)) this.graph.get(v).delete(u)
    }

    display() {
        for (let [node, neighbors] of this.graph) {
            console.log(`${node}: ${Array.from(neighbors).join(", ")}`)
        }
    }

    findCliques() {
        const cliques = []
        const stack = [{
            R: new Set(),
            P: new Set(this.graph.keys()),
            X: new Set()
        }]

        while (stack.length > 0) {
            const { R, P, X } = stack.pop()

            if (P.size === 0 && X.size === 0) {
                cliques.push(R)
                continue
            }

            let pivot = P.size > 0 ? P.values().next().value : X.values().next().value
            const pivotNeighbors = this.graph.get(pivot)

            const PWithoutNeighbors = new Set([...P].filter(v => !pivotNeighbors.has(v)))
            for (let v of PWithoutNeighbors) {
                const neighbors = this.graph.get(v)
                stack.push({
                    R: new Set([...R, v]),
                    P: new Set([...P].filter(u => neighbors.has(u))),
                    X: new Set([...X].filter(u => neighbors.has(u)))
                })
                P.delete(v)
                X.add(v)
            }
        }

        return cliques
    }
  }


  window.SocialGraph = SocialGraph


  return (
    <div className="App">
      <header className="App-header">
        <div className="container">
          <img src={profile.picture} alt="" width={100} />
          {' '}{profile.name}'s webrings
          <p />
          {inactive.map(p => <div key={p.pubkey}>
            <div style={{fontSize: '20px', textDecoration: 'none'}}>
              <Link to={'/' + nip19.npubEncode(p.pubkey)}>
                <img src={p.picture} width={50} />
              </Link>{' '}
              <Link to={p.website} target='_blank'>
                {p.website}
              </Link>
            </div>
          </div>)}
          {cliques.map((clique, index) => (
            <div key={index}>
              <h5>Ring #{index + 1}</h5>
              {clique.map(p => (
                <div key={p.pubkey}>
                  <div style={{fontSize: '20px', textDecoration: 'none'}}>
                    <Link to={'/' + nip19.npubEncode(p.pubkey)}>
                      <img src={p.picture} width={50} />
                    </Link>{' '}
                    <Link to={p.website} target='_blank'>
                      {p.name} {p.website}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </header>
    </div>
  )
}

export default App
