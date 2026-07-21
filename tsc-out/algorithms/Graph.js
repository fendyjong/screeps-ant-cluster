export class Vertex {
    constructor(value) {
        this.value = value;
        this.edges = [];
        this.neighbors = [];
        this.data = {};
    }
    adjacentTo(vertex) {
        return this.neighbors.includes(vertex);
    }
}
export class Edge {
    constructor(vertex1, vertex2, weight, directional) {
        this.vertices = [vertex1, vertex2];
        this.weight = weight ? weight : 1;
        this.directional = directional ? directional : false;
    }
}
export class Graph {
    constructor(initializer = {}) {
        _.defaults(initializer, {
            V: [],
            E: [],
            directed: false,
            simple: true,
            connected: false
        });
        this.vertices = initializer.V;
        this.edges = initializer.E;
        this.directed = initializer.directed;
        this.simple = initializer.directed;
        this.connected = initializer.connected;
        this.counter = 0;
    }
    addVertex(vertex) {
        this.vertices.push(vertex);
        vertex.id = this.counter;
        this.counter++;
    }
    removeVertex(vertex) {
        // Remove vertex from all of its neighbors
        for (const neighbor of vertex.neighbors) {
            _.remove(neighbor.neighbors, vertex);
        }
        // Remove all edges that touch the vertex
        _.remove(this.edges, edge => _.includes(edge.vertices, vertex));
        // Remove the vertex from the list
        _.remove(this.vertices, vertex);
    }
    addEdge(edge) {
        const [vertex1, vertex2] = edge.vertices;
        if (this.simple) {
            if (vertex1.neighbors.includes(vertex2) || vertex2.neighbors.includes(vertex1)) {
                throw new Error(`${vertex1.id} and ${vertex2.id} are already neighbors; graph is not simple.`);
            }
        }
        vertex1.neighbors.push(vertex2);
        vertex1.edges.push(edge);
        if (!edge.directional) {
            vertex2.neighbors.push(vertex1);
            vertex2.edges.push(edge);
        }
        this.edges.push(edge);
    }
    removeEdge(edge) {
        // Remove neighbors connected by this edge
        const [vertex1, vertex2] = edge.vertices;
        _.remove(vertex1.neighbors, vertex2);
        if (!edge.directional) {
            _.remove(vertex2.neighbors, vertex1);
        }
        _.remove(vertex1.edges, edge);
        _.remove(vertex2.edges, edge);
        _.remove(this.edges, edge);
    }
    connect(vertex1, vertex2, weight, directional) {
        const edge = new Edge(vertex1, vertex2, weight, directional);
        this.addEdge(edge);
    }
    disconnect(vertex1, vertex2) {
        let edge = _.find(vertex1.edges, edge => _.includes(edge.vertices, vertex2));
        if (!edge) {
            edge = _.find(vertex2.edges, edge => _.includes(edge.vertices, vertex1));
        }
        if (!edge) {
            throw new Error(`Could not find edge connecting vertices ${vertex1.id} and ${vertex2.id}!`);
        }
        else {
            this.removeEdge(edge);
        }
    }
}
export class CompleteGraph extends Graph {
    constructor(V) {
        super({ V: V, simple: true, connected: true });
        for (const v1 of this.vertices) {
            for (const v2 of this.vertices) {
                if (v1 != v2 && !v1.adjacentTo(v2)) {
                    this.connect(v1, v2);
                }
            }
        }
    }
}
