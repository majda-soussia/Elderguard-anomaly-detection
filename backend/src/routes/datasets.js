const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { upload, getAll, getByHome, uploadDataset, update, remove } = require("../controllers/datasetController");

router.use(protect);

router.get("/",                    getAll);                          // GET    /datasets
router.get("/home/:homeId",        getByHome);                      // GET    /datasets/home/:homeId
router.post("/", upload.single("file"), uploadDataset);             // POST   /datasets  (multipart)
router.put("/:id",                 update);                         // PUT    /datasets/:id
router.delete("/:id",              remove);                         // DELETE /datasets/:id

module.exports = router;