export default class SocialGraph {
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