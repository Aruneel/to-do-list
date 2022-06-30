import { hc } from "@cloudflare/workers-honeycomb-logger"

const hc_config = {
  apiKey: 'Ja8xUAvzdqpgls7a2GB2uC',
  dataset: 'To-do-list',
  acceptTraceContext: true, //Do you want to accept automatic TraceContext information from clients? Defaults to 'false'
  sendTraceContext: true //sendTraceContext?: boolean | RegExp -> set this to true to send a TraceContext with all fetch requests. With a Regex, we will check the URL against the regex first. Defaults to 'false'
}

// when html is loaded for the first time in UI, it will assign window.todos with ${todos} and call populateTodos()
// fn populateTodos() - for each window.todos it creates a div, also creates a checkbox and span (containing to do list text) and inserts into the div. and that div is displayed inside the div having id - todos
// fn updateTodos() - makes a http request to the worker's application as well as update the UI when a new to do list is created 
// fn createTodo() - gets text from input, updates the window.todos by concatinating todos data from the KV and newly created one. And finally calls updateTodos
const html = todos => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Todos</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss/dist/tailwind.min.css" rel="stylesheet"></link>
  </head>

  <body class="bg-blue-100">
    <div class="w-full h-full flex content-center justify-center mt-8">
      <div class="bg-white shadow-md rounded px-8 pt-6 py-8 mb-4">
        <h1 class="block text-grey-800 text-md font-bold mb-2">Todos</h1>
        <div class="flex">
          <input class="shadow appearance-none border rounded w-full py-2 px-3 text-grey-800 leading-tight focus:outline-none focus:shadow-outline" type="text" name="name" placeholder="A new todo"></input>
          <button class="bg-blue-500 hover:bg-blue-800 text-white font-bold ml-2 py-2 px-4 rounded focus:outline-none focus:shadow-outline" id="create" type="submit">Create</button>
        </div>
        <div class="mt-4" id="todos"></div>
      </div>
    </div>
  </body>

  <script>
    window.todos = ${todos}

    var updateTodos = function() { 
      fetch("/", { method: 'PUT', body: JSON.stringify({ todos: window.todos }) })
      populateTodos()
    }

    var completeTodo = function(evt) {
      var checkbox = evt.target
      var todoElement = checkbox.parentNode
      var newTodoSet = [].concat(window.todos)
      var todo = newTodoSet.find(t => t.id == todoElement.dataset.todo)
      todo.completed = !todo.completed
      window.todos = newTodoSet
      updateTodos()
    }

    var populateTodos = function() {
      var todoContainer = document.querySelector("#todos")
      todoContainer.innerHTML = null

      window.todos.forEach(todo => {
        var el = document.createElement("div")
        el.className = "border-t py-4"
        el.dataset.todo = todo.id

        var name = document.createElement("span")
        name.className = todo.completed ? "line-through" : ""
        name.textContent = todo.name

        var checkbox = document.createElement("input")
        checkbox.className = "mx-4"
        checkbox.type = "checkbox"
        checkbox.checked = todo.completed ? 1 : 0
        checkbox.addEventListener('click', completeTodo)

        el.appendChild(checkbox)
        el.appendChild(name)
        todoContainer.appendChild(el)
      })
    }

    populateTodos()

    var createTodo = function() {
      var input = document.querySelector("input[name=name]")
      if (input.value.length) {
        window.todos = [].concat(todos, { id: window.todos.length + 1, name: input.value, completed: false })
        input.value = ""
        updateTodos()
      }
    }

    document.querySelector("#create").addEventListener('click', createTodo)
  </script>
</html>
`

const defaultData = { todos: [] }

const setCache = (key, data) => TODOS_APP.put(key, data)
const getCache = key => TODOS_APP.get(key)

async function getTodos(request) {
  const ip = request.headers.get('CF-Connecting-IP')
  const cacheKey = `data-${ip}`
  let data
  const cache = await getCache(cacheKey) //getting data from KV
  if (!cache) {
    await setCache(cacheKey, JSON.stringify(defaultData)) //putting default data - [] to KV
    data = defaultData
  } else {
    data = JSON.parse(cache)
  }
  const body = html(JSON.stringify(data.todos || []).replace(/</g, "\\u003c"))
  request.tracer.log('handling request for GET todos')
  request.tracer.addData({todoRequestData: data.todos})
  return new Response(body, { //returning response to show the html data to UI
    headers: { 'Content-Type': 'text/html' },
  })
}

async function updateTodos(request) {
  const body = await request.text() //gets the data that has been sent as a request i.e the text of the request body that is been coming in. In our case it would be the updated todos. Ex :  "{ todos: window.todos }"
  const ip = request.headers.get('CF-Connecting-IP')
  const cacheKey = `data-${ip}`
  try {
    JSON.parse(body)
    await setCache(cacheKey, body) //putting data to KV
    request.tracer.log('handling request for PUT todos')
    request.tracer.addData({todoRequestData: body})
    return new Response(body, { status: 200 })
  } catch (err) {
    return new Response(err, { status: 500 })
  }
}

async function handleRequest(request) {
  
  if (request.method === 'PUT') {  
    return updateTodos(request)
  } else {   
    return getTodos(request)
  }
}



// addEventListener('fetch', event => {
//   event.respondWith(handleRequest(event.request))
// })

const listener = hc(hc_config, (event) => {
  event.respondWith(handleRequest(event.request))
})

addEventListener('fetch', listener)