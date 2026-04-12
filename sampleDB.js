// Sample dataset
const data = [];

for (let i = 0; i < 100000; i++) {
  data.push({
    id: i,
    age: Math.floor(Math.random() * 60),
    country: i % 2 === 0 ? "US" : "NP",
  });
}

const table = new Table(data);