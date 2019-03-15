import "reflect-metadata";
import { Connection } from "../../../../src";
import {
  closeTestingConnections,
  createTestingConnections,
  reloadTestingDatabases
} from "../../../../test/utils/test-utils";
import { Post } from "./entity/Post";

describe("spatial-postgres", () => {

    let connections: Connection[];
    beforeAll(async () => connections = await createTestingConnections({
        entities: [__dirname + "/entity/*{.js,.ts}"],
        enabledDrivers: ["postgres"]
    }));
    beforeEach(() => reloadTestingDatabases(connections));
    afterAll(() => closeTestingConnections(connections));

    test("should create correct schema with Postgres' geometry type", () => Promise.all(connections.map(async connection => {
            const queryRunner = connection.createQueryRunner();
            const schema = await queryRunner.getTable("post");
            await queryRunner.release();
            expect(schema).toBeDefined();
            const pointColumn = schema!.columns.find(
                tableColumn =>
                    tableColumn.name === "point" && tableColumn.type === "geometry"
            );
            expect(pointColumn).toBeDefined();
            expect(pointColumn!.spatialFeatureType!.toLowerCase()).toEqual("point");
            expect(pointColumn!.srid).toEqual(4326);
        })
    ));

    test("should create correct schema with Postgres' geography type", () => Promise.all(connections.map(async connection => {
            const queryRunner = connection.createQueryRunner();
            const schema = await queryRunner.getTable("post");
            await queryRunner.release();
            expect(schema).toBeDefined();
            expect(
                schema!.columns.find(
                    tableColumn =>
                        tableColumn.name === "geog" && tableColumn.type === "geography"
                )
            ).toBeDefined();
        })
    ));

    test("should create correct schema with Postgres' geometry indices", () => Promise.all(connections.map(async connection => {
            const queryRunner = connection.createQueryRunner();
            const schema = await queryRunner.getTable("post");
            await queryRunner.release();
            expect(schema).toBeDefined();
            expect(
                schema!.indices.find(
                    tableIndex =>
                        tableIndex.isSpatial === true &&
                        tableIndex.columnNames.length === 1 &&
                        tableIndex.columnNames[0] === "geom"
                )
            ).toBeDefined();
        })
    ));

    test("should persist geometry correctly", () => Promise.all(connections.map(async connection => {
            const geom = {
                type: "Point",
                coordinates: [0, 0]
            };
            const recordRepo = connection.getRepository(Post);
            const post = new Post();
            post.geom = geom;
            const persistedPost = await recordRepo.save(post);
            const foundPost = await recordRepo.findOne(persistedPost.id);
            expect(foundPost).toBeDefined();
            // expect(foundPost!.geom).to.deep.equal(geom);
        })
    ));

    test("should persist geography correctly", () => Promise.all(connections.map(async connection => {
            const geom = {
                type: "Point",
                coordinates: [0, 0]
            };
            const recordRepo = connection.getRepository(Post);
            const post = new Post();
            post.geog = geom;
            const persistedPost = await recordRepo.save(post);
            const foundPost = await recordRepo.findOne(persistedPost.id);
            expect(foundPost).toBeDefined();
            // expect(foundPost!.geog).to.deep.equal(geom);
        })
    ));

    test("should update geometry correctly", () => Promise.all(connections.map(async connection => {
            const geom = {
                type: "Point",
                coordinates: [0, 0]
            };
            const geom2 = {
                type: "Point",
                coordinates: [45, 45]
            };
            const recordRepo = connection.getRepository(Post);
            const post = new Post();
            post.geom = geom;
            const persistedPost = await recordRepo.save(post);

            await recordRepo.update({
                id: persistedPost.id
            }, {
                geom: geom2
            });

            const foundPost = await recordRepo.findOne(persistedPost.id);
            expect(foundPost).toBeDefined();
            // expect(foundPost!.geom).to.deep.equal(geom2);
        })
    ));

    test("should re-save geometry correctly", () => Promise.all(connections.map(async connection => {
            const geom = {
                type: "Point",
                coordinates: [0, 0]
            };
            const geom2 = {
                type: "Point",
                coordinates: [45, 45]
            };
            const recordRepo = connection.getRepository(Post);
            const post = new Post();
            post.geom = geom;
            const persistedPost = await recordRepo.save(post);

            persistedPost.geom = geom2;
            await recordRepo.save(persistedPost);

            const foundPost = await recordRepo.findOne(persistedPost.id);
            expect(foundPost).toBeDefined();
            // expect(foundPost!.geom).to.deep.equal(geom2);
        })
    ));

    test("should be able to order geometries by distance", () => Promise.all(connections.map(async connection => {

        const geoJson1 = {
            type: "Point",
            coordinates: [
                139.9341032213472,
                36.80798008559315
            ]
        };

        const geoJson2 = {
            type: "Point",
            coordinates: [
                139.933053,
                36.805711
            ]
        };

        const origin = {
            type: "Point",
            coordinates: [
                139.933227,
                36.808005
            ]
        };

        const post1 = new Post();
        post1.geom = geoJson1;

        const post2 = new Post();
        post2.geom = geoJson2;
        await connection.manager.save([post1, post2]);

        const posts1 = await connection.manager
            .createQueryBuilder(Post, "post")
            .where("ST_Distance(post.geom, ST_GeomFromGeoJSON(:origin)) > 0")
            .orderBy({
                "ST_Distance(post.geom, ST_GeomFromGeoJSON(:origin))": {
                    order: "ASC",
                    nulls: "NULLS FIRST"
                }
            })
            .setParameters({ origin: JSON.stringify(origin) })
            .getMany();

        const posts2 = await connection.manager
            .createQueryBuilder(Post, "post")
            .orderBy("ST_Distance(post.geom, ST_GeomFromGeoJSON(:origin))", "DESC")
            .setParameters({ origin: JSON.stringify(origin) })
            .getMany();

        expect(posts1[0].id).toEqual(post1.id);
        expect(posts2[0].id).toEqual(post2.id);
    })));

});
